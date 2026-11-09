import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { FinishProductionTrackingTaskPayload } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import { InventoryProductionDocumentCommand } from '../../../inventory/public.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { selectBatchOverview } from '../tasks/mysql-production-batch.read.js';
import {
  readProductionExecutionStartCheck,
  startMaterialSnapshotOf,
} from '../execution/mysql-production-execution-start.js';

@Injectable()
export class MysqlProductionTrackingTaskRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly documents: InventoryProductionDocumentCommand,
  ) {}
  async start(batchId: string, version: number, reason: string | null, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, batchId, true);
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
      return selectBatchOverview(db, batchId);
    });
  }
  async finish(
    batchId: string,
    payload: FinishProductionTrackingTaskPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, batchId, true);
      if (batch.version !== payload.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产任务已经变化，请刷新后重试',
        );
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
      const [unfinishedCards] = await db.query<(RowDataPacket & { id: string })[]>(
        "SELECT CAST(id AS CHAR) id FROM production_tracking_card WHERE production_batch_id=? AND status IN ('unused','in_progress') ORDER BY id FOR UPDATE",
        [batchId],
      );
      await db.execute(
        `UPDATE production_tracking_card SET status='voided',void_reason=?,voided_by=?,voided_at=NOW(),version=version+1,updated_by=? WHERE production_batch_id=? AND status IN ('unused','in_progress')`,
        [payload.reason, context.actorId, context.actorId, batchId],
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
        `UPDATE production_batches SET status='completed',completed_at=NOW(),completed_by=?,finish_reason=?,version=version+1,updated_by=? WHERE id=? AND version=?`,
        [context.actorId, payload.reason, context.actorId, batchId, payload.version],
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
          voidedCardIds: unfinishedCards.map((card) => card.id),
          cancelledOutboundIds: facts.outbounds
            .filter((document) => document.status === 'pending')
            .map((document) => document.id),
        },
      );
      return selectBatchOverview(db, batchId);
    });
  }
}
