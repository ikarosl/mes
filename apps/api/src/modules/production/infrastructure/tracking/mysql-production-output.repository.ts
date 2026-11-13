import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateProductionOutputInboundPayload,
  ProductionOutputQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import { InventoryInboundCommand, InventoryInboundQuery } from '../../../inventory/public.js';
import { ProductionOutputRepository } from '../../application/ports/production-output.repository.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { writeProductionAudit } from '../shared/mysql-production-audit.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import { findWorkOrder } from '../tasks/mysql-work-order.persistence.js';
import { listProductionOutputs } from '../queries/production-output-inbound.query.js';
import { selectProductionOutputForCommand } from './mysql-production-output.read.js';

@Injectable()
export class MysqlProductionOutputRepository extends ProductionOutputRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryInboundCommand,
    private readonly inboundQuery: InventoryInboundQuery,
  ) {
    super();
  }

  list(query: ProductionOutputQuery) {
    return listProductionOutputs(this.pool, query);
  }

  async revoke(outputId: string, reason: string, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const [[reference]] = await db.query<
        (RowDataPacket & { batchId: string; cardId: string | null })[]
      >(
        'SELECT CAST(production_batch_id AS CHAR) batchId,CAST(tracking_card_id AS CHAR) cardId FROM production_tracking_output WHERE id=?',
        [outputId],
      );
      if (!reference) throw new ProductionDomainError('NOT_FOUND', '产出记录不存在');
      const batch = await this.lockBatch(db, reference.batchId);
      const order = await findWorkOrder(db, String(batch.work_order_id), true);
      if (batch.status !== 'doing' || !['released', 'doing'].includes(order.status))
        throw new ProductionDomainError(
          'INVALID_STATE',
          '请先在有效工单下重新打开任务，再撤销未入库产出',
        );
      if (reference.cardId) {
        const [[card]] = await db.query<(RowDataPacket & { status: string })[]>(
          'SELECT status FROM production_tracking_card WHERE id=? FOR UPDATE',
          [reference.cardId],
        );
        if (card?.status !== 'completed')
          throw new ProductionDomainError('CONFLICT', '追踪卡已变化，请刷新后重试');
      }
      const before = await selectProductionOutputForCommand(db, outputId, reference.batchId);
      if (before.cancellation) throw new ProductionDomainError('CONFLICT', '该产出已撤销');
      const receipts = await this.inboundQuery.getTrackingOutputReceipts({ outputIds: [outputId] });
      if (receipts.length) throw new ProductionDomainError('CONFLICT', '该产出已经入库，不能撤销');
      await db.execute(
        'INSERT INTO production_tracking_output_cancellation (production_output_id,reason,created_by) VALUES (?,?,?)',
        [outputId, reason, context.actorId],
      );
      if (reference.cardId) {
        const [updated] = await db.execute<ResultSetHeader>(
          "UPDATE production_tracking_card SET status='in_progress',version=version+1,updated_by=? WHERE id=? AND status='completed'",
          [context.actorId, reference.cardId],
        );
        if (updated.affectedRows !== 1)
          throw new ProductionDomainError('CONCURRENT_MODIFICATION', '追踪卡已变化，请刷新后重试');
      }
      await db.execute('UPDATE production_batches SET version=version+1,updated_by=? WHERE id=?', [
        context.actorId,
        reference.batchId,
      ]);
      const result = await selectProductionOutputForCommand(db, outputId, reference.batchId);
      await writeProductionAudit(
        db,
        context,
        'production-output.revoke',
        'production_tracking_output',
        outputId,
        { quantity: before.quantity, trackingCardId: before.trackingCardId },
        { cancellation: result.cancellation, returnedToTerminal: reference.cardId !== null },
      );
      return result;
    });
  }

  async inbound(
    batchId: string,
    payload: CreateProductionOutputInboundPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const batch = await this.lockBatch(db, batchId);
      if (batch.status === 'cancelled')
        throw new ProductionDomainError('INVALID_STATE', '取消任务不能办理成品入库');
      const order = await findWorkOrder(db, String(batch.work_order_id), true);
      const outputs = [];
      for (const outputId of payload.outputIds) {
        const output = await selectProductionOutputForCommand(db, outputId, batchId);
        if (output.productionBatchId !== batchId || output.productId !== String(batch.product_id))
          throw new ProductionDomainError('INVALID_INPUT', '只能合并同一任务、同一成品的产出');
        if (output.cancellation)
          throw new ProductionDomainError('CONFLICT', '所选产出已撤销，请刷新后重试');
        if (Number(output.quantity) <= 0)
          throw new ProductionDomainError('INVALID_INPUT', '零产出无需办理库存入库');
        outputs.push({ outputId: output.id, quantity: output.quantity });
      }
      const receipts = await this.inboundQuery.getTrackingOutputReceipts({
        outputIds: payload.outputIds,
      });
      if (receipts.length)
        throw new ProductionDomainError('CONFLICT', '所选产出已有入库记录，请刷新后重试');
      const result = await this.inventory.postTrackingOutputs(
        {
          productionBatchId: batchId,
          workOrderId: String(batch.work_order_id),
          productId: String(batch.product_id),
          productCode: batch.product_code_snapshot,
          unit: order.unit_snapshot,
          outputs,
          target: payload.target,
          remark: payload.remark ?? null,
        },
        context,
      );
      await writeProductionAudit(
        db,
        context,
        'production-output.inbound',
        'production_batch',
        batchId,
        null,
        { outputIds: payload.outputIds, ...result },
      );
      return result;
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
