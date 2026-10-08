import { QualityFinishedInspectionQuery } from '../../quality/public.js';
import { InventoryInboundCommand } from '../../inventory/public.js';
import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import { PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type {
  ProductionOutputDetail,
  ProductionOutputCommandResult,
  ProductionOutputDraft,
  ProductionOutputQuantities,
  SaveProductionOutputPayload,
  BeginProductionOutputCorrectionPayload,
  BeginProductionOutputReinspectionPayload,
  SubmitProductionOutputPayload,
  BatchCloseoutApprovalSnapshot,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import type { ApprovalSubjectPreparation } from '../../approval/public.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionOutputRepository } from '../application/ports/production-output.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { requireBatchTransition } from '../domain/production-status.policy.js';
import { findBatch } from './mysql-production.shared.js';
import { MysqlProductionCloseoutRepository } from './mysql-production-closeout.repository.js';
import { writeInventoryAudit } from './mysql-production-inventory.shared.js';
import {
  CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION,
  readCloseoutApprovalSnapshot,
} from '../application/production-approval-snapshot.schema.js';
import {
  type CloseoutRow,
  draftOf,
  lockOutputBatch,
  lockOutputId,
  nullableOutputId,
  outputJson,
  requireEditableOutput,
  requireOutputVersion,
} from './mysql-production-output.persistence.js';
import {
  loadOutputState,
  readOutputRevisionNumbers,
  snapshotOf,
  type OutputState,
} from './mysql-production-output.read.js';
import { startOutputRound } from './mysql-production-output-round.js';
import { readOutputReinspectionPreview } from './mysql-production-output-reinspection.read.js';

@Injectable()
export class MysqlProductionOutputRepository extends ProductionOutputRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly closeout: MysqlProductionCloseoutRepository,
    private readonly inventory: InventoryInboundCommand,
    private readonly quality: QualityFinishedInspectionQuery,
  ) {
    super();
  }

  detail(batchId: string): Promise<ProductionOutputDetail | null> {
    return withTransaction(this.pool, async (db) => {
      const [[row]] = await db.query<CloseoutRow[]>(
        'SELECT * FROM production_batch_closeout WHERE production_batch_id=?',
        [batchId],
      );
      return row ? (await this.loadState(db, row, false)).detail : null;
    });
  }
  previewReinspection(batchId: string) {
    return withTransaction(this.pool, (db) =>
      readOutputReinspectionPreview(db, batchId, this.inventory, this.quality),
    );
  }
  readPreviousRevisionNo(closeoutId: string, revisionId: string): Promise<number | null> {
    return withTransaction(this.pool, async (db) => {
      const numbers = await readOutputRevisionNumbers(db, closeoutId, [revisionId]);
      return numbers.get(revisionId) ?? null;
    });
  }
  saveDraft(
    batchId: string,
    payload: SaveProductionOutputPayload,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult> {
    return withTransaction(this.pool, async (db) => {
      actor(context);
      const row = await lockOutputBatch(db, batchId);
      requireEditableOutput(row, payload.version);
      const state = await this.loadState(db, row, true);
      validateQuantities(payload, Number(state.evidenceCheck.plannedQuantity));
      if (!payload.reason.trim() || !payload.materialReviewNote.trim())
        throw new ProductionDomainError('INVALID_INPUT', '请填写产出说明及物料安排');
      if (
        payload.inspectionRecordId !== null &&
        !state.detail.inspections.some((record) => record.id === payload.inspectionRecordId)
      )
        throw new ProductionDomainError('INVALID_INPUT', '检验记录不属于当前任务');
      assertReceiptQuantities(state, payload);
      if (row.current_round_id === null)
        await startOutputRound(
          db,
          row,
          this.inventory,
          context,
          'initial',
          null,
          payload.availableQuantity + payload.extraQuantity,
        );
      await this.writeDraft(db, row.id, payload, context);
      await this.audit(db, context, 'draft', row, draftOf(row), payload);
      return result(row);
    });
  }
  beginCorrection(
    batchId: string,
    payload: BeginProductionOutputCorrectionPayload,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult> {
    return this.startCorrection(batchId, payload, context, 'finalization_correction');
  }
  beginReinspection(
    batchId: string,
    payload: BeginProductionOutputReinspectionPayload,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult> {
    return this.startCorrection(batchId, payload, context, 'reinspection');
  }
  private startCorrection(
    batchId: string,
    payload: BeginProductionOutputReinspectionPayload,
    context: CommandContext,
    trigger: 'reinspection' | 'finalization_correction',
  ): Promise<ProductionOutputCommandResult> {
    return withTransaction(this.pool, async (db) => {
      actor(context);
      const row = await lockOutputBatch(db, batchId);
      requireOutputVersion(row, payload.version);
      if (
        row.pending_approval_id !== null ||
        (trigger === 'finalization_correction' && row.correction_reason !== null) ||
        nullableOutputId(row.current_revision_id) !== payload.currentRevisionId
      )
        throw new ProductionDomainError('INVALID_STATE', '当前清单不能开始更正，请刷新核对');
      if (!payload.reason.trim())
        throw new ProductionDomainError(
          'INVALID_INPUT',
          trigger === 'reinspection' ? '请填写复检原因' : '请填写清单更正原因',
        );
      const state = await this.loadState(db, row, true);
      if (trigger === 'reinspection' && !state.detail.canBeginReinspection)
        throw new ProductionDomainError('INVALID_STATE', '当前轮次不能再次发起复检，请刷新核对');
      if (!state.base && trigger === 'reinspection') {
        const draft = state.detail.draft;
        if (
          !row.current_round_id ||
          !draft ||
          !state.detail.inspections.some(
            (record) => record.roundId === String(row.current_round_id),
          )
        )
          throw new ProductionDomainError('INVALID_STATE', '当前没有需要复检的检验轮次');
        const roundId = await startOutputRound(
          db,
          row,
          this.inventory,
          context,
          'reinspection',
          payload.reason,
          draft.availableQuantity + draft.extraQuantity,
        );
        await db.execute(
          "UPDATE production_output_round SET status='inspecting',version=version+1,updated_by=? WHERE id=? AND status='pending_inspection'",
          [context.actorId, roundId],
        );
        await db.execute(
          'UPDATE production_batch_closeout SET version=version+1,updated_by=? WHERE id=?',
          [context.actorId, row.id],
        );
        await this.audit(
          db,
          context,
          'reinspection.begin',
          row,
          { previousRoundId: String(row.current_round_id) },
          { reason: payload.reason },
        );
        return result(row);
      }
      if (!state.base)
        throw new ProductionDomainError('INVALID_STATE', '尚无批准清单，不需要办理更正');
      const nextDraft =
        row.correction_reason !== null && state.detail.draft
          ? state.detail.draft
          : state.base.snapshot.output;
      const roundId = await startOutputRound(
        db,
        row,
        this.inventory,
        context,
        trigger,
        payload.reason,
        Math.max(
          0,
          (trigger === 'reinspection'
            ? nextDraft.availableQuantity + nextDraft.extraQuantity
            : Number(state.base.availableQuantity) + Number(state.base.extraQuantity)) -
            Number(state.detail.receipts.productionReceivedQuantity) -
            Number(state.detail.receipts.extraReceivedQuantity),
        ),
      );
      if (trigger === 'reinspection')
        await db.execute(
          "UPDATE production_output_round SET status='inspecting',version=version+1,updated_by=? WHERE id=? AND status='pending_inspection'",
          [context.actorId, roundId],
        );
      await this.writeDraft(db, row.id, nextDraft, context);
      await db.execute('UPDATE production_batch_closeout SET correction_reason=? WHERE id=?', [
        payload.reason,
        row.id,
      ]);
      await this.audit(
        db,
        context,
        trigger === 'reinspection' ? 'reinspection.begin' : 'correction.begin',
        row,
        { currentRevisionId: payload.currentRevisionId },
        { reason: payload.reason },
      );
      return result(row);
    });
  }
  cancelCorrection(
    batchId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult> {
    return withTransaction(this.pool, async (db) => {
      actor(context);
      const row = await lockOutputBatch(db, batchId);
      requireEditableOutput(row, version);
      if (!row.correction_reason || !row.current_revision_id)
        throw new ProductionDomainError('INVALID_STATE', '当前没有可取消的清单更正');
      const [[round]] = await db.query<
        (import('mysql2/promise').RowDataPacket & { status: string })[]
      >('SELECT status FROM production_output_round WHERE id=? AND closeout_id=? FOR UPDATE', [
        row.current_round_id,
        row.id,
      ]);
      if (round?.status === 'inspecting')
        throw new ProductionDomainError('INVALID_STATE', '本轮检验已开始，须先完成检验记录');
      const state = await this.loadState(db, row, true);
      if (!state.base) throw new ProductionDomainError('INVALID_STATE', '批准清单不存在');
      await this.writeDraft(db, row.id, state.base.snapshot.output, context);
      await db.execute(
        "UPDATE production_output_round SET status='superseded',version=version+1,updated_by=? WHERE id=?",
        [context.actorId, row.current_round_id],
      );
      await db.execute('UPDATE production_batch_closeout SET correction_reason=NULL WHERE id=?', [
        row.id,
      ]);
      await this.audit(
        db,
        context,
        'correction.cancel',
        row,
        { correctionReason: row.correction_reason },
        { currentRevisionId: state.base.id },
      );
      return result(row);
    });
  }
  validateSubmission(batchId: string, payload: SubmitProductionOutputPayload): Promise<string> {
    return withTransaction(this.pool, async (db) => {
      const row = await lockOutputBatch(db, batchId);
      requireEditableOutput(row, payload.version);
      const state = await this.loadState(db, row, true);
      if (!state.detail.canSubmit)
        throw new ProductionDomainError('INVALID_STATE', state.detail.blockers.join('；'));
      if (state.detail.submissionToken !== payload.submissionToken)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '产出、检验依据或收尾事实已变化，请刷新核对',
        );
      return String(row.id);
    });
  }
  prepare(
    id: string,
    version: number,
    _context: CommandContext,
  ): Promise<ApprovalSubjectPreparation> {
    return withTransaction(this.pool, async (db) => {
      const row = await lockOutputId(db, id);
      requireEditableOutput(row, version);
      const state = await this.loadState(db, row, true);
      if (!state.detail.canSubmit)
        throw new ProductionDomainError('INVALID_STATE', state.detail.blockers.join('；'));
      if (!state.ownerEvidence.ownerId)
        throw new ProductionDomainError('INVALID_STATE', '工单未配置负责人，不能送审');
      return {
        title: `${state.evidenceCheck.workOrderNo} / ${state.evidenceCheck.batchNo} · ${state.base ? '产出清单更正' : '生产结案'}`,
        subjectVersion: row.version,
        snapshotSchemaVersion: CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION,
        businessAssigneeResolutions: [
          { sourceCode: state.ownerEvidence.sourceCode, userId: state.ownerEvidence.ownerId },
        ],
        snapshot: snapshotOf(row, state),
      };
    });
  }
  bind(id: string, instance: string, version: number, context: CommandContext): Promise<number> {
    return withTransaction(this.pool, async (db) => {
      const prepared = await this.prepare(id, version, context);
      const row = await lockOutputId(db, id);
      requireOutputVersion(row, version);
      await db.execute(
        "UPDATE production_output_round SET status='reviewing',version=version+1,updated_by=? WHERE id=?",
        [context.actorId, row.current_round_id],
      );
      await db.execute(
        'UPDATE production_batch_closeout SET approval_instance_id=?,pending_approval_id=?,review_snapshot=?,version=version+1,updated_by=? WHERE id=?',
        [instance, instance, JSON.stringify(prepared.snapshot), context.actorId, id],
      );
      return version + 1;
    });
  }
  lock(id: string, instance: string, version: number): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      await this.current(db, id, instance, version);
    });
  }
  restore(id: string, instance: string, version: number, context: CommandContext): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.current(db, id, instance, version);
      await db.execute(
        "UPDATE production_output_round SET status='pending_finalization',version=version+1,updated_by=? WHERE id=? AND status='reviewing'",
        [context.actorId, row.current_round_id],
      );
      await db.execute(
        'UPDATE production_batch_closeout SET pending_approval_id=NULL,version=version+1,updated_by=? WHERE id=?',
        [context.actorId, id],
      );
      await this.audit(
        db,
        context,
        'review-end',
        row,
        { instance },
        {
          currentRevisionId: nullableOutputId(row.current_revision_id),
          productionFactsRetained: true,
        },
      );
    });
  }
  finalize(id: string, instance: string, version: number, context: CommandContext): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      actor(context);
      const row = await this.current(db, id, instance, version);
      const snapshot = readCloseoutApprovalSnapshot(
        outputJson(row.review_snapshot),
        CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION,
      );
      const state = await this.loadState(db, row, true, true);
      if (
        !state.detail.canSubmit ||
        !isDeepStrictEqual(comparableSnapshot(snapshot), comparableSnapshot(snapshotOf(row, state)))
      )
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '清单、检验或收尾依据已变化，请驳回或撤回后重核',
        );
      const batch = await findBatch(db, String(row.production_batch_id), true);
      const round = state.detail.rounds.find(
        (item) => item.id === nullableOutputId(row.current_round_id),
      );
      if (!round || round.status === 'superseded')
        throw new ProductionDomainError('INVALID_STATE', '当前办理轮次无效');
      const plannedAllocation =
        snapshot.output.availableQuantity - Number(round.baselinePlannedReceived);
      const extraAllocation = snapshot.output.extraQuantity - Number(round.baselineExtraReceived);
      if (plannedAllocation < 0 || extraAllocation < 0)
        throw new ProductionDomainError('INVALID_INPUT', '累计产出不能低于本轮历史已入基准');
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_output_revision
         (closeout_id,round_id,production_batch_id,work_order_id,product_id,revision_no,previous_revision_id,approval_instance_id,inspection_record_id,
          planned_quantity,additional_scrap_quantity,existing_scrap_quantity,correction_reason,review_snapshot,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          row.id,
          round.id,
          row.production_batch_id,
          snapshot.check.workOrderId,
          batch.product_id,
          (state.base?.revisionNo ?? 0) + 1,
          row.current_revision_id,
          instance,
          snapshot.inspection.id,
          snapshot.check.plannedQuantity,
          snapshot.output.additionalScrapQuantity,
          snapshot.check.existingScrapQuantity,
          row.correction_reason,
          JSON.stringify(snapshot),
          context.actorId,
        ],
      );
      for (const [category, quantity] of [
        ['self_made', plannedAllocation],
        ['production_extra', extraAllocation],
      ] as const) {
        if (quantity > 0)
          await db.execute(
            'INSERT INTO production_output_allocation (revision_id,round_id,closeout_id,category,quantity,created_by) VALUES (?,?,?,?,?,?)',
            [created.insertId, round.id, row.id, category, quantity, context.actorId],
          );
      }
      await db.execute(
        "UPDATE production_output_round SET status='finalized',version=version+1,updated_by=? WHERE id=?",
        [context.actorId, round.id],
      );
      if (!state.base) {
        const status = row.closeout_mode === 'normal' ? 'completed' : 'terminated';
        requireBatchTransition(batch.status, status);
        await db.execute(
          `UPDATE production_batches SET status=?,completed_at=?,completed_by=?,version=version+1,updated_by=? WHERE id=?`,
          [
            status,
            status === 'completed' ? new Date() : null,
            status === 'completed' ? context.actorId : null,
            context.actorId,
            row.production_batch_id,
          ],
        );
      }
      await db.execute(
        'UPDATE production_batch_closeout SET current_revision_id=?,pending_approval_id=NULL,correction_reason=NULL,version=version+1,updated_by=? WHERE id=?',
        [created.insertId, context.actorId, row.id],
      );
      await this.audit(
        db,
        context,
        'approved',
        row,
        { currentRevisionId: nullableOutputId(row.current_revision_id) },
        { revisionId: String(created.insertId), approvalInstanceId: instance, ...snapshot.output },
      );
    });
  }
  private async current(
    db: PoolConnection,
    id: string,
    instance: string,
    version: number,
  ): Promise<CloseoutRow> {
    const row = await lockOutputId(db, id);
    requireOutputVersion(row, version);
    if (nullableOutputId(row.pending_approval_id) !== instance)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '产出审批申请已变化或结束');
    return row;
  }
  private async writeDraft(
    db: PoolConnection,
    id: number,
    draft: ProductionOutputDraft,
    context: CommandContext,
  ): Promise<void> {
    await db.execute(
      `UPDATE production_batch_closeout SET available_quantity=?,extra_quantity=?,additional_scrap_quantity=?,output_reason=?,material_review_note=?,inspection_record_id=?,version=version+1,updated_by=? WHERE id=?`,
      [
        draft.availableQuantity,
        draft.extraQuantity,
        draft.additionalScrapQuantity,
        draft.reason,
        draft.materialReviewNote,
        draft.inspectionRecordId,
        context.actorId,
        id,
      ],
    );
  }
  private audit(
    db: PoolConnection,
    context: CommandContext,
    action: string,
    row: CloseoutRow,
    before: object | null,
    after: object,
  ) {
    return writeInventoryAudit(
      db,
      context,
      `production-output.${action}`,
      'production_batch',
      String(row.production_batch_id),
      before,
      { closeoutId: String(row.id), ...after },
    );
  }

  private loadState(
    db: PoolConnection,
    row: CloseoutRow,
    lock: boolean,
    forFinalApproval = false,
  ): Promise<OutputState> {
    return loadOutputState(
      db,
      row,
      this.closeout,
      lock,
      forFinalApproval,
      this.inventory,
      this.quality,
    );
  }
}
function actor(context: CommandContext): void {
  if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人');
}
function result(row: CloseoutRow): ProductionOutputCommandResult {
  return { closeoutId: String(row.id), batchId: String(row.production_batch_id) };
}
function validateQuantities(quantities: ProductionOutputQuantities, plan: number): void {
  if (
    [
      quantities.availableQuantity,
      quantities.extraQuantity,
      quantities.additionalScrapQuantity,
    ].some(
      (value) =>
        !Number.isSafeInteger(value) || value < 0 || value > PRODUCTION_OUTPUT_QUANTITY_MAX,
    ) ||
    quantities.availableQuantity > plan
  )
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '数量必须是安全范围内的非负整数，计划内产出不得超过计划量',
    );
}
function assertReceiptQuantities(state: OutputState, draft: ProductionOutputDraft): void {
  if (
    draft.availableQuantity < Number(state.detail.receipts.productionReceivedQuantity) ||
    draft.extraQuantity < Number(state.detail.receipts.extraReceivedQuantity)
  )
    throw new ProductionDomainError('INVALID_INPUT', '累计产出不能低于各类别历史已入数量');
}
/** 负责人在送审时已固定；其他任务引起的工单版本变化不重派审批人。 */
function comparableSnapshot(
  snapshot: BatchCloseoutApprovalSnapshot,
): Omit<BatchCloseoutApprovalSnapshot, 'workOrderOwnerEvidence'> {
  return {
    kind: snapshot.kind,
    mode: snapshot.mode,
    previousRevisionId: snapshot.previousRevisionId,
    correctionReason: snapshot.correctionReason,
    inspection: snapshot.inspection,
    closeoutId: snapshot.closeoutId,
    check: snapshot.check,
    output: snapshot.output,
    actions: snapshot.actions,
  };
}
