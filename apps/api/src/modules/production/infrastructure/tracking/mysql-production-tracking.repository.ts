import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type {
  ConfirmProductionTrackingOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  ProductionTrackingCardQuery,
  ProductionTrackingPersonnelSnapshot,
  ProductionTrackingReportQuery,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import { allocateBusinessNumber } from '../../../../infrastructure/numbering/mysql-business-number.js';
import { InventoryInboundCommand } from '../../../inventory/public.js';
import { ProductionTrackingRepository } from '../../application/ports/production-tracking.repository.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
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

type CardRow = RowDataPacket & {
  id: string;
  production_batch_id: string;
  quantity: number;
  status: string;
  current_step_record_id: string | null;
  version: number;
};
type StepRow = RowDataPacket & { id: string; step_order: number };

@Injectable()
export class MysqlProductionTrackingRepository extends ProductionTrackingRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryInboundCommand,
    private readonly tasks: MysqlProductionTrackingTaskRepository,
  ) {
    super();
  }

  list(query: ProductionTrackingCardQuery) {
    return listTrackingCards(this.pool, query);
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
  ) {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, batchId, true);
      this.requireOpenTask(batch.status);
      if (batch.order_type !== 'mass_production')
        throw new ProductionDomainError(
          'INVALID_STATE',
          '研发任务直接在任务中确认最终产出，不建立追踪卡',
        );
      const steps = await this.steps(db, batchId);
      if (!steps.length)
        throw new ProductionDomainError('INVALID_STATE', '任务没有已冻结的工艺路线');
      const cardNo = await allocateBusinessNumber(db, 'production_tracking_card');
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_tracking_card (production_batch_id,card_no,quantity,personnel_id,personnel_code_snapshot,personnel_name_snapshot,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          batchId,
          cardNo,
          payload.quantity,
          person.personnelId,
          person.personnelCode,
          person.personnelName,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const id = String(result.insertId);
      await writeProductionAudit(
        db,
        context,
        'production-tracking-card.create',
        'production_tracking_card',
        id,
        null,
        { cardNo, ...payload, ...person },
      );
      return selectTrackingCard(db, id);
    });
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
        'SELECT id FROM production_tracking_visit WHERE tracking_card_id=? AND batch_step_record_id=?',
        [cardId, payload.stepRecordId],
      );
      // A repeated physical scan never changes the registered person or counts output again.
      if (existing.length && card.status !== 'voided')
        return {
          card: await selectTrackingCard(db, cardId),
          duplicate: true,
          completedVisitId: null,
        };
      if (batch.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '请先开始任务，再扫码流转');
      this.requireMutableCard(card);
      if ((await this.openAbnormalityCount(db, cardId, true)) > 0)
        throw new ProductionDomainError('CONFLICT', '该盘存在暂停异常，处理完成后才能继续流转');
      const current =
        card.current_step_record_id === null
          ? -1
          : steps.findIndex((step) => step.id === card.current_step_record_id);
      if (next !== current + 1)
        throw new ProductionDomainError('CONFLICT', '必须按冻结路线逐站扫码，不能跳站');
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
      return { card: await selectTrackingCard(db, cardId), duplicate: false, completedVisitId };
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
      return selectTrackingCard(db, cardId);
    });
  }
  async void(cardId: string, payload: VoidProductionTrackingCardPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireMutableCard(card);
      this.requireVersion(card.version, payload.version);
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
      return selectTrackingCard(db, cardId);
    });
  }
  async createAbnormality(
    cardId: string,
    payload: CreateProductionTrackingAbnormalityPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const card = await this.card(db, cardId);
      this.requireMutableCard(card);
      this.requireVersion(card.version, payload.version);
      this.requireOpenTask((await findBatch(db, card.production_batch_id, true)).status);
      const stepRecordId = payload.stepRecordId ?? card.current_step_record_id;
      if (stepRecordId !== null) {
        const [visited] = await db.query<RowDataPacket[]>(
          'SELECT id FROM production_tracking_visit WHERE tracking_card_id=? AND batch_step_record_id=?',
          [cardId, stepRecordId],
        );
        if (!visited.length)
          throw new ProductionDomainError('INVALID_INPUT', '异常涉及工序必须是该盘已经到站的工序');
      }
      await db.execute(
        `INSERT INTO production_tracking_abnormality (tracking_card_id,production_batch_id,batch_step_record_id,severity,description,personnel_id,personnel_code_snapshot,personnel_name_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          cardId,
          card.production_batch_id,
          stepRecordId,
          payload.severity,
          payload.description,
          person.personnelId,
          person.personnelCode,
          person.personnelName,
          context.actorId,
          context.actorId,
        ],
      );
      await db.execute(
        'UPDATE production_tracking_card SET version=version+1,updated_by=? WHERE id=?',
        [context.actorId, cardId],
      );
      await writeProductionAudit(
        db,
        context,
        'production-tracking-abnormality.create',
        'production_tracking_card',
        cardId,
        null,
        { ...payload, ...person },
      );
      return selectTrackingCard(db, cardId);
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
      await this.card(db, cardId);
      const [[abnormality]] = await db.query<
        (RowDataPacket & { version: number; status: string })[]
      >(
        'SELECT version,status FROM production_tracking_abnormality WHERE id=? AND tracking_card_id=? FOR UPDATE',
        [abnormalityId, cardId],
      );
      if (!abnormality) throw new ProductionDomainError('NOT_FOUND', '随盘异常不存在');
      this.requireVersion(abnormality.version, payload.version);
      if (abnormality.status === 'resolved')
        throw new ProductionDomainError('INVALID_STATE', '该异常已处理完成');
      await db.execute(
        'INSERT INTO production_tracking_abnormality_handling (abnormality_id,content,resolves_abnormality,personnel_id,personnel_code_snapshot,personnel_name_snapshot,created_by) VALUES (?,?,?,?,?,?,?)',
        [
          abnormalityId,
          payload.content,
          Number(payload.resolve),
          person.personnelId,
          person.personnelCode,
          person.personnelName,
          context.actorId,
        ],
      );
      await db.execute(
        `UPDATE production_tracking_abnormality SET status=?,resolved_at=${payload.resolve ? 'NOW()' : 'NULL'},version=version+1,updated_by=? WHERE id=? AND version=?`,
        [payload.resolve ? 'resolved' : 'open', context.actorId, abnormalityId, payload.version],
      );
      await db.execute(
        'UPDATE production_tracking_card SET version=version+1,updated_by=? WHERE id=?',
        [context.actorId, cardId],
      );
      await writeProductionAudit(
        db,
        context,
        'production-tracking-abnormality.handle',
        'production_tracking_abnormality',
        abnormalityId,
        { status: abnormality.status },
        { ...payload, ...person },
      );
      return selectTrackingCard(db, cardId);
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
      if ((await this.openAbnormalityCount(db, cardId)) > 0)
        throw new ProductionDomainError('CONFLICT', '请先处理该盘全部异常，再确认最终可用产出');
      if (payload.availableQuantity > Number(card.quantity))
        throw new ProductionDomainError(
          'INVALID_INPUT',
          '最终可用产出不能超过当前盘量，实际盘量有误请先更正盘量',
        );
      await this.insertOutput(db, card.production_batch_id, cardId, payload, person, context);
      await db.execute(
        'UPDATE production_tracking_visit SET completed_at=NOW(),completed_by=?,reported_quantity=? WHERE tracking_card_id=? AND batch_step_record_id=? AND completed_at IS NULL',
        [context.actorId, card.quantity, cardId, last.id],
      );
      await db.execute(
        `UPDATE production_tracking_card SET status='completed',version=version+1,updated_by=? WHERE id=? AND version=?`,
        [context.actorId, cardId, payload.version],
      );
      return selectTrackingCard(db, cardId);
    });
  }
  async confirmResearchOutput(
    batchId: string,
    payload: ConfirmProductionTrackingOutputPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, batchId, true);
      this.requireVersion(batch.version, payload.version);
      if (batch.status !== 'doing' || batch.order_type !== 'research')
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有执行中的研发任务可以在任务级确认产出',
        );
      if (await selectTrackingOutput(db, batchId, null))
        throw new ProductionDomainError('CONFLICT', '该研发任务已经确认最终产出');
      await this.insertOutput(db, batchId, null, payload, person, context);
      await db.execute(
        'UPDATE production_batches SET version=version+1,updated_by=? WHERE id=? AND version=?',
        [context.actorId, batchId, payload.version],
      );
      const output = await selectTrackingOutput(db, batchId, null);
      if (!output) throw new Error('最终产出写入后缺失');
      return output;
    });
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
  private async insertOutput(
    db: PoolConnection,
    batchId: string,
    cardId: string | null,
    payload: ConfirmProductionTrackingOutputPayload,
    person: ProductionTrackingPersonnelSnapshot,
    context: CommandContext,
  ): Promise<void> {
    const batch = await findBatch(db, batchId, true);
    const order = await findWorkOrder(db, String(batch.work_order_id), true);
    const [created] = await db.execute<ResultSetHeader>(
      'INSERT INTO production_tracking_output (production_batch_id,tracking_card_id,work_order_id,product_id,quantity,personnel_id,personnel_code_snapshot,personnel_name_snapshot,confirmed_by,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        batchId,
        cardId,
        batch.work_order_id,
        batch.product_id,
        payload.availableQuantity,
        person.personnelId,
        person.personnelCode,
        person.personnelName,
        context.actorId,
        payload.remark ?? null,
      ],
    );
    const outputId = String(created.insertId);
    if (payload.availableQuantity > 0)
      await this.inventory.confirmTrackingOutput(
        {
          outputId,
          productionBatchId: batchId,
          workOrderId: String(batch.work_order_id),
          productId: String(batch.product_id),
          productCode: batch.product_code_snapshot,
          unit: order.unit_snapshot,
          quantity: String(payload.availableQuantity),
          remark: payload.remark ?? null,
        },
        context,
      );
    await writeProductionAudit(
      db,
      context,
      'production-tracking-output.confirm',
      'production_tracking_output',
      outputId,
      null,
      {
        productionBatchId: batchId,
        trackingCardId: cardId,
        quantity: String(payload.availableQuantity),
        ...person,
      },
    );
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
      'SELECT CAST(id AS CHAR) id,step_order_snapshot step_order FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id',
      [batchId],
    );
    return rows;
  }
  private async openAbnormalityCount(
    db: PoolConnection,
    cardId: string,
    pausedOnly = false,
  ): Promise<number> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM production_tracking_abnormality WHERE tracking_card_id=? AND status='open'${pausedOnly ? " AND severity='pause'" : ''} FOR UPDATE`,
      [cardId],
    );
    return rows.length;
  }
  private requireMutableCard(card: CardRow): void {
    if (card.status === 'completed' || card.status === 'voided')
      throw new ProductionDomainError(
        'INVALID_STATE',
        '已确认产出或已作废的追踪卡不能再流转、改量或作废',
      );
  }
  private requireOpenTask(status: string): void {
    if (['completed', 'terminated', 'cancelled', 'closing'].includes(status))
      throw new ProductionDomainError('INVALID_STATE', '任务已经结束，不能继续办理追踪卡');
  }
  private requireVersion(actual: number, expected: number): void {
    if (actual !== expected)
      throw new ProductionDomainError(
        'CONCURRENT_MODIFICATION',
        '记录已被其他操作修改，请刷新后重试',
      );
  }
}
