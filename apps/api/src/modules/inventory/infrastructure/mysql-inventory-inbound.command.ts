import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import { fixedIntegerQuantity, MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import {
  InventoryInboundCommand,
  type TrackingOutputInput,
  type TrackingOutputResult,
} from '../application/inventory-inbound.command.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
} from '../application/inventory-purchase-inbound.types.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { MysqlInventoryPurchaseInboundWriter } from './mysql-inventory-purchase-inbound.writer.js';

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

  confirmTrackingOutput(
    input: TrackingOutputInput,
    context: CommandContext,
  ): Promise<TrackingOutputResult> {
    validateOutput(input);
    return withActiveConnection(this.pool, async (connection) => {
      if (connection === this.pool) throw new Error('终检入库必须位于 Production 同池事务中');
      const db = connection as PoolConnection;
      const eligibility = await this.products.lockHistoricalReferences({
        references: [],
        productIds: [input.productId],
      });
      if (eligibility.status !== 'success')
        throw new InventoryDomainError('INVALID_INPUT', eligibility.message);
      const quantity = fixedIntegerQuantity(input.quantity);
      const batchNo = await allocateBusinessNumber(db, 'inventory_batch');
      const [batch] = await db.execute<ResultSetHeader>(
        `INSERT INTO item_batch(product_id,item_code_snapshot,unit_snapshot,batch_code,source_type,batch_status,remark,created_by,updated_by)
         VALUES (?,?,?,?,'finished_product','available',?,?,?)`,
        [
          input.productId,
          input.productCode,
          input.unit,
          batchNo,
          input.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const batchId = String(batch.insertId);
      const inboundNo = await allocateBusinessNumber(db, 'finished_inbound');
      const [order] = await db.execute<ResultSetHeader>(
        `INSERT INTO inbound_order(inbound_no,source_type,work_order_id,production_batch_id,product_id,status,remark,created_by,updated_by)
         VALUES (?,'finished_product',?,?,?,'pending',?,?,?)`,
        [
          inboundNo,
          input.workOrderId,
          input.productionBatchId,
          input.productId,
          input.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const inboundId = String(order.insertId);
      const [detail] = await db.execute<ResultSetHeader>(
        `INSERT INTO inbound_detail(inbound_id,line_no,source_type,product_id,batch_id,target_mode,new_batch_key,production_output_id,item_code_snapshot,inbound_number,unit_snapshot,stock_status,created_by,updated_by)
         VALUES (?,1,'finished_product',?,?,'new',?,?,?,?,?,'available',?,?)`,
        [
          inboundId,
          input.productId,
          batchId,
          `OUTPUT:${input.outputId}`,
          input.outputId,
          input.productCode,
          quantity,
          input.unit,
          context.actorId,
          context.actorId,
        ],
      );
      const inboundDetailId = String(detail.insertId);
      const [transaction] = await db.execute<ResultSetHeader>(
        `INSERT INTO inventory_transaction(product_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,remark,created_by)
         VALUES (?,?,'production_inbound',?,?,'available','inbound_detail',?,?,?,?)`,
        [
          input.productId,
          batchId,
          quantity,
          input.unit,
          inboundDetailId,
          `INBOUND:${inboundDetailId}`,
          input.remark ?? null,
          context.actorId,
        ],
      );
      await db.execute(
        "UPDATE inbound_order SET status='completed',inbound_at=CURRENT_TIMESTAMP,operator_id=?,version=version+1,updated_by=? WHERE id=?",
        [context.actorId, context.actorId, inboundId],
      );
      const result: TrackingOutputResult = {
        inboundId,
        inboundNo,
        inboundDetailId,
        batchId,
        batchNo,
        transactionId: String(transaction.insertId),
        quantity,
      };
      await writeTransactionalAudit(db, {
        logType: 'business',
        module: 'inventory',
        action: 'inventory.tracking-output.confirm',
        userId: context.actorId,
        targetType: 'inbound_order',
        targetId: inboundId,
        result: 'success',
        beforeData: null,
        afterData: { ...result, outputId: input.outputId },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return result;
    });
  }
}

function validateOutput(input: TrackingOutputInput): void {
  const quantity = Number(input.quantity);
  if (
    [input.productionBatchId, input.workOrderId, input.productId, input.outputId].some(
      (id) => !/^[1-9]\d*$/.test(id),
    ) ||
    !input.productCode.trim() ||
    !input.unit.trim() ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > MAX_PERSISTED_INTEGER_QUANTITY
  )
    throw new InventoryDomainError('INVALID_INPUT', '终检产出来源或入库数量无效');
}
