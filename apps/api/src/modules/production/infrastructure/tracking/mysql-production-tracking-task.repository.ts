import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  FinishProductionTrackingTaskPayload,
  ReopenProductionTrackingTaskPayload,
  ProductionBatchStatus,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import {
  InventoryInboundQuery,
  InventoryProductionDocumentCommand,
} from '../../../inventory/public.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { requireBatchTransition } from '../../domain/production-status.policy.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { findWorkOrder } from '../tasks/mysql-work-order.persistence.js';
import { selectCurrentBatchOverview } from './mysql-production-current-batch-overview.js';
import {
  readProductionExecutionStartCheck,
  startMaterialSnapshotOf,
} from '../execution/mysql-production-execution-start.js';

@Injectable()
export class MysqlProductionTrackingTaskRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly documents: InventoryProductionDocumentCommand,
    private readonly inboundQuery: InventoryInboundQuery,
  ) {}
  async startCheck(batchId: string) {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, batchId);
      return readProductionExecutionStartCheck(db, batch, this.documents);
    });
  }
  async start(batchId: string, version: number, reason: string | null, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const batch = await this.lockBatch(db, batchId);
      if (batch.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产任务已经变化，请刷新后重试',
        );
      const check = await readProductionExecutionStartCheck(db, batch, this.documents, true);
      if (!check.canStart)
        throw new ProductionDomainError('INVALID_STATE', check.blockedReason ?? '任务当前不能开始');
      if (check.requiresReason && !reason)
        throw new ProductionDomainError('INVALID_INPUT', '当前存在未领物料，请填写提前开工说明');
      if (batch.started_at === null)
        await db.execute(
          `UPDATE production_batches SET status='doing',started_at=NOW(),started_by=?,start_reason=?,start_material_snapshot=?,version=version+1,updated_by=? WHERE id=? AND version=?`,
          [
            context.actorId,
            reason,
            JSON.stringify(startMaterialSnapshotOf(check)),
            context.actorId,
            batchId,
            version,
          ],
        );
      else
        await db.execute(
          "UPDATE production_batches SET status='doing',version=version+1,updated_by=? WHERE id=? AND version=?",
          [context.actorId, batchId, version],
        );
      await db.execute(
        `UPDATE work_orders SET status='doing',version=version+1,updated_by=? WHERE id=? AND status='released'`,
        [context.actorId, batch.work_order_id],
      );
      await writeProductionAudit(
        db,
        context,
        'production-task.start',
        'production_batch',
        batchId,
        { status: batch.status },
        { status: 'doing', reason, startMaterialSnapshot: startMaterialSnapshotOf(check) },
      );
      return selectCurrentBatchOverview(db, batchId, this.inboundQuery);
    });
  }
  async finish(
    batchId: string,
    payload: FinishProductionTrackingTaskPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const batch = await this.lockBatch(db, batchId);
      if (batch.version !== payload.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产任务已经变化，请刷新后重试',
        );
      if (batch.status === 'draft')
        throw new ProductionDomainError('INVALID_STATE', '尚未下达的任务草稿请办理取消');
      if (
        ![
          'pending',
          'material_pending',
          'material_assigned',
          'material_partially_outbound',
          'material_outbound',
          'doing',
        ].includes(batch.status)
      )
        throw new ProductionDomainError('INVALID_STATE', '任务已经结束，不能重复结束');
      if (payload.mode === 'normal' && batch.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '只有执行中的任务可以正常结束');
      const [unfinishedCards] = await db.query<
        (RowDataPacket & { id: string; quantity: number })[]
      >(
        "SELECT CAST(id AS CHAR) id,quantity FROM production_tracking_card WHERE production_batch_id=? AND status IN ('unused','in_progress') ORDER BY id FOR UPDATE",
        [batchId],
      );
      const [openAbnormalities] = await db.query<RowDataPacket[]>(
        "SELECT id FROM production_tracking_abnormality WHERE production_batch_id=? AND status='open' ORDER BY id FOR UPDATE",
        [batchId],
      );
      if (payload.mode === 'normal' && (unfinishedCards.length || openAbnormalities.length))
        throw new ProductionDomainError(
          'CONFLICT',
          '仍有未完成追踪卡或未处理异常，请先办理完成，或明确选择提前结束',
        );
      if (unfinishedCards.some((card) => Number(card.quantity) === 0))
        throw new ProductionDomainError(
          'CONFLICT',
          '存在盘量为零且异常未结算的追踪卡，请先完成关联报废结算再结束任务',
        );
      const [pending] = await db.query<RowDataPacket[]>(
        'SELECT id FROM production_item_demand WHERE production_batch_id=? AND pending_correction_id IS NOT NULL FOR UPDATE',
        [batchId],
      );
      if (pending.length)
        throw new ProductionDomainError('CONFLICT', '请先撤回或处理任务中的需求更正审批');
      const [pendingLosses] = await db.query<RowDataPacket[]>(
        "SELECT id FROM item_scrap WHERE production_batch_id=? AND status='pending' ORDER BY id FOR UPDATE",
        [batchId],
      );
      if (pendingLosses.length)
        throw new ProductionDomainError('CONFLICT', '请先确认或取消待处理的领料损耗记录');
      const facts = await this.documents.facts({ productionBatchId: batchId, lock: true });
      const pendingReturns = facts.returns.filter((document) => document.status === 'pending');
      if (pendingReturns.length)
        throw new ProductionDomainError('CONFLICT', '请先完成或取消待确认退料单');
      for (const outbound of facts.outbounds.filter((document) => document.status === 'pending'))
        await this.documents.cancelOutbound(
          outbound.id,
          outbound.version,
          payload.reason,
          'production_termination',
          context,
        );
      await db.execute(
        `UPDATE production_item_allocation SET allocation_status='released',version=version+1,updated_by=? WHERE production_batch_id=? AND allocation_status IN ('active','frozen','abnormal')`,
        [context.actorId, batchId],
      );
      await db.execute(
        `UPDATE production_item_demand SET business_status='closed',close_cause='task_finished',close_reason=?,closed_by=?,closed_at=NOW(),version=version+1,updated_by=? WHERE production_batch_id=? AND business_status='active'`,
        [payload.reason, context.actorId, context.actorId, batchId],
      );
      await db.execute(
        `UPDATE production_batches SET status='completed',completed_at=NOW(),completed_by=?,finish_reason=?,finish_mode=?,version=version+1,updated_by=? WHERE id=? AND version=?`,
        [context.actorId, payload.reason, payload.mode, context.actorId, batchId, payload.version],
      );
      await writeProductionAudit(
        db,
        context,
        'production-task.finish',
        'production_batch',
        batchId,
        { status: batch.status },
        {
          status: 'completed',
          reason: payload.reason,
          mode: payload.mode,
          pausedCardIds: unfinishedCards.map((card) => card.id),
          cancelledOutboundIds: facts.outbounds
            .filter((document) => document.status === 'pending')
            .map((document) => document.id),
        },
      );
      return selectCurrentBatchOverview(db, batchId, this.inboundQuery);
    });
  }
  async reopen(
    batchId: string,
    payload: ReopenProductionTrackingTaskPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const batch = await this.lockBatch(db, batchId);
      if (batch.version !== payload.version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '任务已变化，请刷新后重试');
      if (batch.status !== 'completed')
        throw new ProductionDomainError('INVALID_STATE', '只有已结束任务可以重新打开');
      const order = await findWorkOrder(db, String(batch.work_order_id), true);
      if (!['released', 'doing'].includes(order.status))
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有已下达或执行中的工单允许重新打开任务',
        );
      const [configuration] = await db.query<RowDataPacket[]>(
        batch.order_type === 'research'
          ? 'SELECT id FROM production_item_demand WHERE production_batch_id=? ORDER BY id LIMIT 1 FOR SHARE'
          : 'SELECT id FROM production_material_requirement_basis WHERE production_batch_id=? ORDER BY id LIMIT 1 FOR SHARE',
        [batchId],
      );
      let status: ProductionBatchStatus = 'pending';
      if (batch.started_at !== null) status = 'doing';
      else if (configuration.length) status = 'material_pending';
      requireBatchTransition(batch.status, status);
      await db.execute(
        `UPDATE production_batches SET status=?,completed_at=NULL,completed_by=NULL,finish_reason=NULL,finish_mode=NULL,version=version+1,updated_by=? WHERE id=? AND version=?`,
        [status, context.actorId, batchId, payload.version],
      );
      if (status === 'doing')
        await db.execute(
          "UPDATE work_orders SET status='doing',version=version+1,updated_by=? WHERE id=? AND status='released'",
          [context.actorId, batch.work_order_id],
        );
      await writeProductionAudit(
        db,
        context,
        'production-task.reopen',
        'production_batch',
        batchId,
        { status: batch.status, finishReason: batch.finish_reason, finishMode: batch.finish_mode },
        { status, reason: payload.reason },
      );
      return selectCurrentBatchOverview(db, batchId, this.inboundQuery);
    });
  }
  private async lockBatch(db: PoolConnection, batchId: string) {
    const [[reference]] = await db.query<(RowDataPacket & { workOrderId: string })[]>(
      'SELECT CAST(work_order_id AS CHAR) workOrderId FROM production_batches WHERE id=?',
      [batchId],
    );
    if (!reference) throw new ProductionDomainError('NOT_FOUND', '生产任务不存在');
    await findWorkOrder(db, reference.workOrderId, true);
    return findBatch(db, batchId, true);
  }
}
