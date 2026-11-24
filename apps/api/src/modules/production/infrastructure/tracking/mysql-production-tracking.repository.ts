import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BindProductionTrackingItemMarkPayload,
  CancelProductionTrackingItemMarkPayload,
  CorrectProductionTrackingItemMarkPayload,
  PageQuery,
  ProductionTrackingItemMarkQuery,
  ProductionTrackingItemMarkWorkspaceQuery,
  SaveProductionTrackingItemMarkWorkspacePayload,
  ConfirmProductionTrackingOutputPayload,
  ConfirmProductionResearchOutputPayload,
  CorrectProductionTrackingAbnormalityScrapPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  CreateProductionTrackingCardsPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  PageResult,
  ProductionTrackingCardDetail,
  ProductionTrackingAbnormalityDescriptionQuery,
  ProductionTrackingCardsCreatedResult,
  ProductionTrackingPersonnelSnapshot,
  ProductionTrackingReportQuery,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingAbnormalityPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import { listTrackingItemMarkWorkspaceRows } from '../queries/production-item-mark-workspace.query.js';
import { saveTrackingItemMarkWorkspace } from './mysql-production-tracking-item-mark-workspace.js';
import {
  ProductionTrackingRepository,
  type ProductionTrackingCardListQuery,
} from '../../application/ports/production-tracking.repository.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import {
  requireTrackingAffectedQuantity,
  requireTrackingCorrectedQuantity,
  resolveTrackingAbnormalityReportHandling,
} from '../../domain/production-tracking-disposition.policy.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { findWorkOrder } from '../tasks/mysql-work-order.persistence.js';
import {
  listTrackingCards,
  listTrackingReports,
  selectTrackingCard,
  selectTrackingOutput,
  selectTrackingWorkbench,
} from './mysql-production-tracking.read.js';
import { MysqlProductionTrackingTaskRepository } from './mysql-production-tracking-task.repository.js';
import {
  adjustTrackingAbnormality,
  trackingAdjustmentCardBlockedReason,
  type TrackingAbnormalityAdjustment,
} from './mysql-production-tracking-abnormality-adjustment.js';
import { settleTrackingAbnormality } from './mysql-production-tracking-disposition.js';
import {
  requireTrackingDescriptionLabels,
  selectTrackingDescriptionOptions,
} from './mysql-production-tracking-labels.js';
import {
  confirmResearchTrackingOutput,
  insertTrackingOutput,
} from './mysql-production-tracking-output.js';
import {
  createTrackingCardAtFirstStation,
  createUnusedTrackingCards,
} from './mysql-production-tracking-create.js';
import {
  bindTrackingItemMark,
  cancelTrackingItemMark,
  correctTrackingItemMark,
  selectTrackingItemMarkingSummary,
} from './mysql-production-tracking-item-mark.js';
import {
  listTrackingItemMarks,
  listOccupiedItemMarkCodes,
  getTrackingItemMark,
  listTrackingItemMarkCorrections,
} from '../queries/production-item-mark.query.js';

type CardRow = RowDataPacket & {
  id: string;
  production_batch_id: string;
  quantity: number;
  status: string;
  current_step_record_id: string | null;
  version: number;
};
type StepRow = RowDataPacket & { id: string; step_order: number; step_name: string };

@Injectable()
export class MysqlProductionTrackingRepository extends ProductionTrackingRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly tasks: MysqlProductionTrackingTaskRepository,
  ) {
    super();
  }

  list(query: ProductionTrackingCardListQuery) {
    return listTrackingCards(this.pool, query);
  }
  itemMarks(query: ProductionTrackingItemMarkQuery) {
    return withTransaction(this.pool, (db) => listTrackingItemMarks(db, query));
  }
  itemMarkWorkspace(query: ProductionTrackingItemMarkWorkspaceQuery) {
    return withTransaction(this.pool, (db) => listTrackingItemMarkWorkspaceRows(db, query));
  }
  saveItemMarkWorkspace(
    batchId: string,
    payload: SaveProductionTrackingItemMarkWorkspacePayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, (db) =>
      saveTrackingItemMarkWorkspace(db, batchId, payload, person, context),
    );
  }
  occupiedItemMarkCodes(markCodes: string[]) {
    return listOccupiedItemMarkCodes(this.pool, markCodes);
  }
  itemMark(cardId: string, markId: string) {
    return withTransaction(this.pool, (db) => getTrackingItemMark(db, cardId, markId));
  }
  itemMarkCorrections(cardId: string, markId: string, query: PageQuery) {
    return listTrackingItemMarkCorrections(this.pool, cardId, markId, query);
  }
  bindItemMark(
    cardId: string,
    payload: BindProductionTrackingItemMarkPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    return withTransaction(this.pool, async (db) => {
      await bindTrackingItemMark(db, cardId, payload, person, context);
      return selectTrackingCard(db, cardId, true);
    });
  }
  cancelItemMark(
    cardId: string,
    markId: string,
    payload: CancelProductionTrackingItemMarkPayload,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    return withTransaction(this.pool, async (db) => {
      await cancelTrackingItemMark(db, cardId, markId, payload, context);
      return selectTrackingCard(db, cardId, true);
    });
  }
  correctItemMark(
    cardId: string,
    markId: string,
    payload: CorrectProductionTrackingItemMarkPayload,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    return withTransaction(this.pool, async (db) => {
      await correctTrackingItemMark(db, cardId, markId, payload, context);
      return selectTrackingCard(db, cardId, true);
    });
  }
  get(cardId: string) {
    return withTransaction(this.pool, (db) => selectTrackingCard(db, cardId));
  }
  workbench(batchId: string) {
    return withTransaction(this.pool, (db) => selectTrackingWorkbench(db, batchId));
  }
  reports(query: ProductionTrackingReportQuery) {
    return listTrackingReports(this.pool, query);
  }
  startCheck(batchId: string) {
    return this.tasks.startCheck(batchId);
  }
  abnormalityDescriptionOptions(
    processStepId: string | null,
    query: ProductionTrackingAbnormalityDescriptionQuery,
  ): Promise<PageResult<string>> {
    return selectTrackingDescriptionOptions(this.pool, processStepId, query);
  }
  async abnormalityStepReference(
    cardId: string,
    stepRecordId?: string | null,
  ): Promise<{ stepRecordId: string; routeStepId: string } | null> {
    return withTransaction(this.pool, async (db) => {
      const [[row]] = await db.query<
        (RowDataPacket & {
          stepRecordId: string | null;
          routeStepId: string | null;
          visited: number;
        })[]
      >(
        `SELECT CAST(? AS CHAR) stepRecordId,
         CAST(s.route_step_id AS CHAR) routeStepId,v.id IS NOT NULL visited
         FROM production_tracking_card c
         LEFT JOIN batch_step_records s ON s.id=?
          AND s.production_batch_id=c.production_batch_id
         LEFT JOIN production_tracking_visit v ON v.tracking_card_id=c.id AND v.batch_step_record_id=s.id
         WHERE c.id=?`,
        [stepRecordId ?? null, stepRecordId ?? null, cardId],
      );
      if (!row) throw new ProductionDomainError('NOT_FOUND', '追踪卡不存在');
      if (row.stepRecordId === null) return null;
      if (!row.routeStepId || !row.visited)
        throw new ProductionDomainError('INVALID_INPUT', '异常关联工序必须是该盘已经到站的工序');
      return { stepRecordId: row.stepRecordId, routeStepId: row.routeStepId };
    });
  }
  async withBatchTransaction<T>(batchId: string, action: () => Promise<T>): Promise<T> {
    return withTransaction(this.pool, async (db) => {
      const [[reference]] = await db.query<(RowDataPacket & { work_order_id: string })[]>(
        'SELECT CAST(work_order_id AS CHAR) work_order_id FROM production_batches WHERE id=?',
        [batchId],
      );
      if (!reference) throw new ProductionDomainError('NOT_FOUND', '生产任务不存在');
      await findWorkOrder(db, reference.work_order_id, true);
      await findBatch(db, batchId, true);
      return action();
    });
  }
  async withCardTransaction<T>(
    identifier: string,
    byNumber: boolean,
    action: (cardId: string) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (db) => {
      const [[reference]] = await db.query<
        (RowDataPacket & { id: string; production_batch_id: string })[]
      >(
        `SELECT CAST(id AS CHAR) id,CAST(production_batch_id AS CHAR) production_batch_id FROM production_tracking_card WHERE ${byNumber ? 'card_no' : 'id'}=?`,
        [identifier],
      );
      if (!reference) throw new ProductionDomainError('NOT_FOUND', '追踪卡不存在，请核对卡号');
      return this.withBatchTransaction(reference.production_batch_id, async () => {
        await this.card(db, reference.id);
        return action(reference.id);
      });
    });
  }
  async create(
    batchId: string,
    payload: CreateProductionTrackingCardPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardDetail> {
    return withTransaction(this.pool, (db) =>
      createTrackingCardAtFirstStation(db, batchId, payload, person, context),
    );
  }
  createBulk(
    batchId: string,
    payload: CreateProductionTrackingCardsPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<ProductionTrackingCardsCreatedResult> {
    return withTransaction(this.pool, (db) =>
      createUnusedTrackingCards(db, batchId, payload, person, context),
    );
  }
  async scan(
    cardId: string,
    payload: ScanProductionTrackingCardPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      const batch = await findBatch(db, card.production_batch_id, true);
      const steps = await this.steps(db, card.production_batch_id);
      const next = steps.findIndex((step) => step.id === payload.stepRecordId);
      if (next < 0) throw new ProductionDomainError('INVALID_INPUT', '该工序不属于追踪卡所在任务');
      const [existing] = await db.query<RowDataPacket[]>(
        'SELECT id FROM production_tracking_visit WHERE tracking_card_id=? AND batch_step_record_id=? FOR UPDATE',
        [cardId, payload.stepRecordId],
      );
      if (card.status === 'scrapped' || Number(card.quantity) === 0) this.requireMutableCard(card);
      // A repeated physical scan never changes the registered person or counts output again.
      if (existing.length && card.status !== 'voided')
        return {
          card: await selectTrackingCard(db, cardId, true),
          duplicate: true,
          completedVisitId: null,
        };
      if (batch.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '请先开始任务，再扫码流转');
      this.requireMutableCard(card);
      if ((await this.openAbnormalitySummary(db, cardId)).count > 0)
        throw new ProductionDomainError(
          'CONFLICT',
          '该盘存在未处理异常，全部处理完成后才能继续流转',
        );
      const current =
        card.current_step_record_id === null
          ? -1
          : steps.findIndex((step) => step.id === card.current_step_record_id);
      if (next !== current + 1) {
        const expected = steps[current + 1];
        throw new ProductionDomainError(
          'CONFLICT',
          expected
            ? `请先流转至第 ${expected.step_order} 步「${expected.step_name}」并扫码，不能跳站。`
            : '当前路线中没有可流转的下一步，请刷新并核对追踪卡记录。',
        );
      }
      let completedVisitId: string | null = null;
      if (current >= 0) {
        const [[visit]] = await db.query<(RowDataPacket & { id: string })[]>(
          'SELECT CAST(id AS CHAR) id FROM production_tracking_visit WHERE tracking_card_id=? AND batch_step_record_id=? AND completed_at IS NULL FOR UPDATE',
          [cardId, card.current_step_record_id],
        );
        if (!visit)
          throw new ProductionDomainError('CONFLICT', '前站到站事实缺失或已经完成，请刷新后重试');
        completedVisitId = visit.id;
        await db.execute(
          'UPDATE production_tracking_visit SET completed_at=NOW(),completed_by=?,reported_quantity=? WHERE id=? AND completed_at IS NULL',
          [context.actorId, card.quantity, visit.id],
        );
      }
      await db.execute(
        `INSERT INTO production_tracking_visit (tracking_card_id,production_batch_id,batch_step_record_id,personnel_id,personnel_code_snapshot,personnel_name_snapshot,arrived_by) VALUES (?,?,?,?,?,?,?)`,
        [
          cardId,
          card.production_batch_id,
          payload.stepRecordId,
          person.personnelId,
          person.personnelCode,
          person.personnelName,
          context.actorId,
        ],
      );
      await db.execute(
        `UPDATE production_tracking_card SET status='in_progress',current_step_record_id=?,version=version+1,updated_by=? WHERE id=?`,
        [payload.stepRecordId, context.actorId, cardId],
      );
      await writeProductionAudit(
        db,
        context,
        'production-tracking-card.scan',
        'production_tracking_card',
        cardId,
        { stepRecordId: card.current_step_record_id },
        {
          stepRecordId: payload.stepRecordId,
          completedVisitId,
          quantity: String(card.quantity),
          ...person,
        },
      );
      return {
        card: await selectTrackingCard(db, cardId, true),
        duplicate: false,
        completedVisitId,
      };
    });
  }
  async correctQuantity(
    cardId: string,
    payload: CorrectProductionTrackingQuantityPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireMutableCard(card);
      this.requireVersion(card.version, payload.version);
      this.requireOpenTask((await findBatch(db, card.production_batch_id, true)).status);
      if (Number(card.quantity) === payload.quantity)
        throw new ProductionDomainError('INVALID_INPUT', '更正数量与当前盘量相同');
      const open = await this.openAbnormalitySummary(db, cardId);
      requireTrackingCorrectedQuantity(payload.quantity, open.affectedQuantity);
      const marking = await selectTrackingItemMarkingSummary(db, cardId, true);
      if (payload.quantity < marking.activeCount)
        throw new ProductionDomainError('INVALID_INPUT', '更正后的盘量不能小于有效单件刻码数量');
      await db.execute(
        'INSERT INTO production_tracking_quantity_change (tracking_card_id,previous_quantity,quantity,reason,created_by) VALUES (?,?,?,?,?)',
        [cardId, card.quantity, payload.quantity, payload.reason, context.actorId],
      );
      await db.execute(
        'UPDATE production_tracking_card SET quantity=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [payload.quantity, context.actorId, cardId, payload.version],
      );
      await writeProductionAudit(
        db,
        context,
        'production-tracking-card.quantity.correct',
        'production_tracking_card',
        cardId,
        { quantity: String(card.quantity) },
        { quantity: String(payload.quantity), reason: payload.reason },
      );
      return selectTrackingCard(db, cardId, true);
    });
  }
  async void(cardId: string, payload: VoidProductionTrackingCardPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireMutableCard(card);
      this.requireVersion(card.version, payload.version);
      this.requireOpenTask((await findBatch(db, card.production_batch_id, true)).status);
      await db.execute(
        `UPDATE production_tracking_card SET status='voided',void_reason=?,voided_by=?,voided_at=NOW(),version=version+1,updated_by=? WHERE id=? AND version=?`,
        [payload.reason, context.actorId, context.actorId, cardId, payload.version],
      );
      await writeProductionAudit(
        db,
        context,
        'production-tracking-card.void',
        'production_tracking_card',
        cardId,
        { status: card.status },
        { reason: payload.reason },
      );
      return selectTrackingCard(db, cardId, true);
    });
  }
  async createAbnormality(
    cardId: string,
    payload: CreateProductionTrackingAbnormalityPayload,
    processStepId: string | null,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireMutableCard(card);
      this.requireVersion(card.version, payload.version);
      this.requireOpenTask((await findBatch(db, card.production_batch_id, true)).status);
      const open = await this.openAbnormalitySummary(db, cardId);
      requireTrackingAffectedQuantity(
        payload.affectedQuantity,
        Number(card.quantity),
        open.affectedQuantity,
      );
      const handling = resolveTrackingAbnormalityReportHandling(payload);
      const stepRecordId = payload.stepRecordId ?? null;
      if (stepRecordId !== null) {
        const [visited] = await db.query<RowDataPacket[]>(
          'SELECT id FROM production_tracking_visit WHERE tracking_card_id=? AND batch_step_record_id=? FOR UPDATE',
          [cardId, stepRecordId],
        );
        if (!visited.length)
          throw new ProductionDomainError('INVALID_INPUT', '异常关联工序必须是该盘已经到站的工序');
      }
      const labels = await requireTrackingDescriptionLabels(
        db,
        processStepId,
        payload.descriptionLabels,
        context.actorId,
      );
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_tracking_abnormality (tracking_card_id,production_batch_id,batch_step_record_id,affected_quantity,description,personnel_id,personnel_code_snapshot,personnel_name_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          cardId,
          card.production_batch_id,
          stepRecordId,
          payload.affectedQuantity,
          labels.map(({ label }) => label).join('；'),
          person.personnelId,
          person.personnelCode,
          person.personnelName,
          context.actorId,
          context.actorId,
        ],
      );
      const abnormalityId = String(created.insertId);
      for (const [index, label] of labels.entries())
        await db.execute(
          `INSERT INTO production_tracking_abnormality_label_assignment
           (abnormality_id,label_id,label_order) VALUES (?,?,?)`,
          [abnormalityId, label.id, index + 1],
        );
      await writeProductionAudit(
        db,
        context,
        'production-tracking-abnormality.create',
        'production_tracking_card',
        cardId,
        null,
        {
          ...payload,
          ...person,
          abnormalityId,
          descriptionLabels: labels.map(({ label }) => label),
        },
      );
      const lastStep = (await this.steps(db, card.production_batch_id)).at(-1);
      const scrapMode =
        lastStep?.id === card.current_step_record_id ? 'item_marked' : 'optional_marks';
      await settleTrackingAbnormality(
        db,
        card,
        abnormalityId,
        handling,
        person,
        context,
        scrapMode,
      );
      return selectTrackingCard(db, cardId, true);
    });
  }
  async handleAbnormality(
    cardId: string,
    abnormalityId: string,
    payload: HandleProductionTrackingAbnormalityPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireUnfinishedCard(card);
      this.requireOpenTask((await findBatch(db, card.production_batch_id, true)).status);
      await settleTrackingAbnormality(db, card, abnormalityId, payload, person, context, 'unknown');
      return selectTrackingCard(db, cardId, true);
    });
  }
  correctAbnormalityScrap(
    cardId: string,
    abnormalityId: string,
    payload: CorrectProductionTrackingAbnormalityScrapPayload,
    context: CommandContext,
  ) {
    return this.adjustAbnormality(cardId, abnormalityId, { ...payload, kind: 'correct' }, context);
  }
  voidAbnormality(
    cardId: string,
    abnormalityId: string,
    payload: VoidProductionTrackingAbnormalityPayload,
    context: CommandContext,
  ) {
    return this.adjustAbnormality(cardId, abnormalityId, { ...payload, kind: 'void' }, context);
  }
  private async adjustAbnormality(
    cardId: string,
    abnormalityId: string,
    adjustment: TrackingAbnormalityAdjustment,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireVersion(card.version, adjustment.cardVersion);
      const batch = await findBatch(db, card.production_batch_id, true);
      const output = await selectTrackingOutput(db, card.production_batch_id, cardId, true);
      const blocked = trackingAdjustmentCardBlockedReason(
        batch.status,
        card.status,
        output !== null,
      );
      if (blocked) throw new ProductionDomainError('INVALID_STATE', blocked);
      const open = await this.openAbnormalitySummary(db, cardId);
      await adjustTrackingAbnormality(
        db,
        card,
        abnormalityId,
        adjustment,
        open.affectedQuantity,
        context,
      );
      return selectTrackingCard(db, cardId, true);
    });
  }
  async confirmOutput(
    cardId: string,
    payload: ConfirmProductionTrackingOutputPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireMutableCard(card);
      this.requireVersion(card.version, payload.version);
      const batch = await findBatch(db, card.production_batch_id, true);
      if (batch.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '任务不在执行中，不能确认最终产出');
      const steps = await this.steps(db, card.production_batch_id);
      const last = steps.at(-1);
      if (!last || card.current_step_record_id !== last.id)
        throw new ProductionDomainError('CONFLICT', '该盘尚未到达末站，不能确认最终产出');
      if ((await this.openAbnormalitySummary(db, cardId)).count > 0)
        throw new ProductionDomainError('CONFLICT', '请先处理该盘全部异常，再确认最终可用产出');
      if (await selectTrackingOutput(db, card.production_batch_id, cardId, true))
        throw new ProductionDomainError('CONFLICT', '该追踪卡已经确认有效产出');
      await insertTrackingOutput(
        db,
        card.production_batch_id,
        cardId,
        Number(card.quantity),
        payload.remark ?? null,
        person,
        context,
      );
      await db.execute(
        'UPDATE production_tracking_visit SET completed_at=NOW(),completed_by=?,reported_quantity=? WHERE tracking_card_id=? AND batch_step_record_id=? AND completed_at IS NULL',
        [context.actorId, card.quantity, cardId, last.id],
      );
      await db.execute(
        `UPDATE production_tracking_card SET status='completed',version=version+1,updated_by=? WHERE id=? AND version=?`,
        [context.actorId, cardId, payload.version],
      );
      return selectTrackingCard(db, cardId, true);
    });
  }
  async confirmResearchOutput(
    batchId: string,
    payload: ConfirmProductionResearchOutputPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, (db) =>
      confirmResearchTrackingOutput(db, batchId, payload, person, context),
    );
  }
  startTask(batchId: string, version: number, reason: string | null, context: CommandContext) {
    return this.tasks.start(batchId, version, reason, context);
  }
  finishTask(
    batchId: string,
    payload: FinishProductionTrackingTaskPayload,
    context: CommandContext,
  ) {
    return this.tasks.finish(batchId, payload, context);
  }
  reopenTask(
    batchId: string,
    payload: ReopenProductionTrackingTaskPayload,
    context: CommandContext,
  ) {
    return this.tasks.reopen(batchId, payload, context);
  }
  async sopReference(batchId: string, recordId: string) {
    const [[row]] = await this.pool.query<
      (RowDataPacket & {
        fileId: string | null;
        fileName: string | null;
        objectKey: string | null;
        versionNo: string | null;
      })[]
    >(
      `SELECT CASE WHEN actual_sop_object_key_snapshot IS NOT NULL THEN CAST(actual_sop_file_id AS CHAR) ELSE CAST(sop_file_id_snapshot AS CHAR) END fileId,CASE WHEN actual_sop_object_key_snapshot IS NOT NULL THEN actual_sop_file_name_snapshot ELSE sop_file_name_snapshot END fileName,COALESCE(actual_sop_object_key_snapshot,sop_object_key_snapshot) objectKey,COALESCE(actual_sop_version_no_snapshot,sop_version_no_snapshot) versionNo FROM batch_step_records WHERE production_batch_id=? AND id=?`,
      [batchId, recordId],
    );
    if (!row?.fileId || !row.fileName || !row.objectKey || !row.versionNo)
      throw new ProductionDomainError('NOT_FOUND', '该工序没有可追溯的 SOP 快照');
    return {
      fileId: row.fileId,
      fileName: row.fileName,
      objectKey: row.objectKey,
      versionNo: row.versionNo,
    };
  }
  private async card(db: PoolConnection, id: string): Promise<CardRow> {
    const [[row]] = await db.query<CardRow[]>(
      'SELECT CAST(id AS CHAR) id,CAST(production_batch_id AS CHAR) production_batch_id,quantity,status,CAST(current_step_record_id AS CHAR) current_step_record_id,version FROM production_tracking_card WHERE id=? FOR UPDATE',
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '追踪卡不存在');
    return row;
  }
  private async steps(db: PoolConnection, batchId: string): Promise<StepRow[]> {
    const [rows] = await db.query<StepRow[]>(
      'SELECT CAST(id AS CHAR) id,step_order_snapshot step_order,step_name_snapshot step_name FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id',
      [batchId],
    );
    return rows;
  }
  private async openAbnormalitySummary(
    db: PoolConnection,
    cardId: string,
  ): Promise<{ count: number; affectedQuantity: number }> {
    const [rows] = await db.query<(RowDataPacket & { affected_quantity: number | string })[]>(
      "SELECT id,affected_quantity FROM production_tracking_abnormality WHERE tracking_card_id=? AND status='open' ORDER BY id FOR UPDATE",
      [cardId],
    );
    return {
      count: rows.length,
      affectedQuantity: rows.reduce((sum, row) => sum + Number(row.affected_quantity), 0),
    };
  }
  private requireMutableCard(card: CardRow): void {
    this.requireUnfinishedCard(card);
    if (Number(card.quantity) === 0)
      throw new ProductionDomainError(
        'INVALID_STATE',
        '当前盘量为零，请先完成剩余异常的关联报废结算',
      );
  }
  private requireUnfinishedCard(card: CardRow): void {
    if (['completed', 'scrapped', 'voided'].includes(card.status))
      throw new ProductionDomainError(
        'INVALID_STATE',
        '已确认产出、整盘报废或已作废的追踪卡不能继续办理',
      );
  }
  private requireOpenTask(status: string): void {
    if (['draft', 'completed', 'cancelled'].includes(status))
      throw new ProductionDomainError('INVALID_STATE', '尚未下达或已结束的任务不能办理追踪卡');
  }
  private requireVersion(actual: number, expected: number): void {
    if (actual !== expected)
      throw new ProductionDomainError(
        'CONCURRENT_MODIFICATION',
        '记录已被其他操作修改，请刷新后重试',
      );
  }
}
