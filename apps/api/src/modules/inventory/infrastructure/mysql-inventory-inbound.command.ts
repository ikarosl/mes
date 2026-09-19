import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection, withTransaction } from '@company/database';
import { fixedIntegerQuantity, integerQuantity } from '@company/utils';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type {
  FinishedGoodsInboundSource,
  InboundOrderStatus,
  ProductionOutputReceipts,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import {
  InventoryInboundCommand,
  type FinishedInboundStorage,
  type FinishedInboundWrite,
} from '../application/inventory-inbound.command.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { MysqlInventoryPurchaseInboundWriter } from './mysql-inventory-purchase-inbound.writer.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
} from '../application/inventory-purchase-inbound.types.js';

type FinishedRow = RowDataPacket & FinishedInboundStorage;
@Injectable()
export class MysqlInventoryInboundCommand extends InventoryInboundCommand {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly products: ProductInventoryEligibility,
    private readonly purchases: MysqlInventoryPurchaseInboundWriter,
  ) {
    super();
  }
  confirmPurchaseReceipt(
    input: ConfirmPurchaseReceiptInput,
    context: CommandContext,
  ): Promise<ConfirmPurchaseReceiptResult> {
    return this.purchases.confirm(input, context);
  }
  getFinishedLocator(id: string): Promise<{ productionBatchId: string }> {
    return withActiveConnection(this.pool, async (db) => {
      const [[row]] = await db.query<(RowDataPacket & { productionBatchId: string })[]>(
        "SELECT CAST(production_batch_id AS CHAR) productionBatchId FROM inbound_order WHERE id=? AND source_type IN ('self_made','production_extra')",
        [id],
      );
      if (!row) throw new InventoryDomainError('NOT_FOUND', '成品入库单不存在');
      return { productionBatchId: row.productionBatchId };
    });
  }
  getFinishedOrder(id: string, lock = false): Promise<FinishedInboundStorage> {
    return withActiveConnection(this.pool, async (db) => {
      if (lock && db === this.pool) throw new Error('成品入库锁必须位于调用方事务中');
      const [[row]] = await db.query<FinishedRow[]>(
        `SELECT CAST(o.id AS CHAR) inboundId,o.inbound_no inboundNo,CAST(o.production_batch_id AS CHAR) productionBatchId,
         CAST(o.work_order_id AS CHAR) workOrderId,CAST(o.product_id AS CHAR) productId,CAST(o.output_revision_id AS CHAR) outputRevisionId,
         o.source_type sourceType,o.status,o.version,CAST(d.id AS CHAR) detailId,d.inbound_number quantity,d.requested_batch_code batchCode,CAST(d.batch_id AS CHAR) batchId,
         CAST((SELECT tx.id FROM inventory_transaction tx WHERE tx.product_id=o.product_id AND tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id AND tx.transaction_type='production_inbound') AS CHAR) transactionId,
         CAST(o.created_by AS CHAR) createdBy,o.created_at createdAt,CAST(o.operator_id AS CHAR) operatorId,o.inbound_at inboundAt,o.remark,o.cancel_reason cancelReason,CAST(o.cancelled_by AS CHAR) cancelledBy,o.cancelled_at cancelledAt
         FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id AND d.product_id=o.product_id
         WHERE o.id=? AND o.source_type IN ('self_made','production_extra')${lock ? ' FOR UPDATE' : ''}`,
        [id],
      );
      if (!row) throw new InventoryDomainError('NOT_FOUND', '成品入库单不存在');
      return { ...row, quantity: String(row.quantity) };
    });
  }
  listFinishedSlots(
    batchId: string,
    source: FinishedGoodsInboundSource,
  ): Promise<Array<{ id: string; status: InboundOrderStatus }>> {
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool) throw new Error('成品入库类别锁必须位于调用方事务中');
      const [rows] = await db.query<(RowDataPacket & { id: number; status: InboundOrderStatus })[]>(
        "SELECT id,status FROM inbound_order WHERE production_batch_id=? AND source_type=? AND status IN ('pending','completed') ORDER BY id FOR UPDATE",
        [batchId, source],
      );
      return rows.map((row) => ({ id: String(row.id), status: row.status }));
    });
  }
  readFinishedReceipts(batchId: string, lock: boolean): Promise<ProductionOutputReceipts> {
    return withActiveConnection(this.pool, async (db) => {
      if (lock && db === this.pool) throw new Error('成品收货事实锁必须位于调用方事务中');
      const [rows] = await db.query<
        (RowDataPacket & {
          id: number;
          source_type: FinishedGoodsInboundSource;
          quantity: string;
        })[]
      >(
        `SELECT o.id,o.source_type,d.inbound_number quantity
         FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
         WHERE o.production_batch_id=? AND o.status='completed' AND o.source_type IN ('self_made','production_extra') ORDER BY o.id,d.id${lock ? ' FOR SHARE' : ''}`,
        [batchId],
      );
      const production = rows.find((row) => row.source_type === 'self_made'),
        extra = rows.find((row) => row.source_type === 'production_extra');
      return {
        productionInboundId: production ? String(production.id) : null,
        productionReceivedQuantity: production
          ? fixedIntegerQuantity(
              rows
                .filter((row) => row.source_type === 'self_made')
                .reduce((total, row) => total + integerQuantity(row.quantity), 0),
            )
          : '0',
        extraInboundId: extra ? String(extra.id) : null,
        extraReceivedQuantity: extra
          ? fixedIntegerQuantity(
              rows
                .filter((row) => row.source_type === 'production_extra')
                .reduce((total, row) => total + integerQuantity(row.quantity), 0),
            )
          : '0',
      };
    });
  }
  createFinishedDraft(
    input: FinishedInboundWrite,
    context: CommandContext,
  ): Promise<{ inboundId: string }> {
    return withTransaction(this.pool, async (db) => {
      await this.lockProduct(input.productId);
      const [order] = await db.execute<ResultSetHeader>(
        `INSERT INTO inbound_order (inbound_no,source_type,work_order_id,production_batch_id,product_id,output_revision_id,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,'pending',?,?,?)`,
        [
          `FI-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          input.sourceType,
          input.workOrderId,
          input.productionBatchId,
          input.productId,
          input.outputRevisionId,
          input.remark,
          context.actorId,
          context.actorId,
        ],
      );
      const id = String(order.insertId);
      await db.execute(
        "INSERT INTO inbound_detail (inbound_id,product_id,requested_batch_code,item_code_snapshot,inbound_number,unit_snapshot,stock_status,created_by) VALUES (?,?,?,?,?,?,'available',?)",
        [
          id,
          input.productId,
          input.batchCode,
          input.itemCode,
          input.quantity,
          input.unit,
          context.actorId,
        ],
      );
      return { inboundId: id };
    });
  }
  updateFinishedDraft(
    id: string,
    version: number,
    input: FinishedInboundWrite,
    context: CommandContext,
  ): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      await this.lockProduct(input.productId);
      const row = await this.getFinishedOrder(id, true);
      requirePending(row, version);
      requireSource(row, input);
      await db.execute(
        'UPDATE inbound_detail SET requested_batch_code=?,inbound_number=? WHERE id=? AND batch_id IS NULL',
        [input.batchCode, input.quantity, row.detailId],
      );
      await db.execute(
        'UPDATE inbound_order SET output_revision_id=?,remark=?,version=version+1,updated_by=? WHERE id=?',
        [input.outputRevisionId, input.remark, context.actorId, id],
      );
    });
  }
  cancelFinishedDraft(
    id: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.getFinishedOrder(id, true);
      requirePending(row, version);
      await db.execute(
        "UPDATE inbound_order SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=? WHERE id=?",
        [reason, context.actorId, context.actorId, id],
      );
    });
  }
  confirmFinishedReceipt(
    id: string,
    version: number,
    input: FinishedInboundWrite,
    context: CommandContext,
  ): Promise<{ itemBatchId: string; inventoryTransactionId: string }> {
    return withTransaction(this.pool, async (db) => {
      await this.lockProduct(input.productId);
      const row = await this.getFinishedOrder(id, true);
      requirePending(row, version);
      requireSource(row, input);
      if (
        row.outputRevisionId !== input.outputRevisionId ||
        Number(row.quantity) !== Number(input.quantity)
      )
        throw new InventoryDomainError(
          'CONCURRENT_MODIFICATION',
          '入库草稿未采用最新批准清单，请先核对数量并保存',
        );
      const [batch] = await db.execute<ResultSetHeader>(
        `INSERT INTO item_batch (product_id,item_code_snapshot,unit_snapshot,batch_code,source_type,source_work_order_id,source_production_batch_id,batch_status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,'available',?,?,?)`,
        [
          input.productId,
          input.itemCode,
          input.unit,
          row.batchCode,
          input.sourceType,
          input.workOrderId,
          input.productionBatchId,
          row.remark,
          context.actorId,
          context.actorId,
        ],
      );
      await db.execute('UPDATE inbound_detail SET batch_id=? WHERE id=? AND batch_id IS NULL', [
        batch.insertId,
        row.detailId,
      ]);
      const [transaction] = await db.execute<ResultSetHeader>(
        `INSERT INTO inventory_transaction (product_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,remark,created_by)
         VALUES (?,?,'production_inbound',?,?,'available','inbound_detail',?,?,?,?)`,
        [
          input.productId,
          batch.insertId,
          input.quantity,
          input.unit,
          row.detailId,
          `FGI:${id}:${row.detailId}`,
          row.remark,
          context.actorId,
        ],
      );
      await db.execute(
        "UPDATE inbound_order SET status='completed',inbound_at=NOW(),operator_id=?,updated_by=?,version=version+1 WHERE id=?",
        [context.actorId, context.actorId, id],
      );
      return {
        itemBatchId: String(batch.insertId),
        inventoryTransactionId: String(transaction.insertId),
      };
    });
  }
  private async lockProduct(productId: string): Promise<void> {
    const result = await this.products.lockHistoricalReferences({
      references: [],
      productIds: [productId],
    });
    if (result.status !== 'success')
      throw new InventoryDomainError(
        result.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
        result.message,
      );
  }
}
function requirePending(row: FinishedInboundStorage, version: number): void {
  if (row.status !== 'pending' || row.batchId !== null)
    throw new InventoryDomainError('INVALID_STATE', '只有尚未入库的待确认成品单可以操作');
  if (row.version !== version)
    throw new InventoryDomainError('CONCURRENT_MODIFICATION', '入库单已变化，请刷新核对');
}
function requireSource(row: FinishedInboundStorage, input: FinishedInboundWrite): void {
  if (
    row.productionBatchId !== input.productionBatchId ||
    row.workOrderId !== input.workOrderId ||
    row.productId !== input.productId ||
    row.sourceType !== input.sourceType
  )
    throw new InventoryDomainError('CONFLICT', '成品入库来源不一致');
}
