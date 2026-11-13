import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import { fixedIntegerQuantity, MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import type {
  TrackingOutputsInput,
  TrackingOutputsResult,
} from '../application/inventory-inbound.command.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';

type BatchRow = RowDataPacket & {
  id: number | string;
  product_id: number | string | null;
  unit_snapshot: string;
  item_code_snapshot: string;
  source_type: string;
  batch_status: string;
  batch_code: string;
  version: number;
};

@Injectable()
export class MysqlInventoryTrackingInboundWriter {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly products: ProductInventoryEligibility,
  ) {}

  post(input: TrackingOutputsInput, context: CommandContext): Promise<TrackingOutputsResult> {
    validateInput(input);
    return withActiveConnection(this.pool, async (connection) => {
      if (connection === this.pool) throw new Error('产出入库必须位于 Production 同池事务中');
      const db = connection as PoolConnection;
      const eligibility = await this.products.lockHistoricalReferences({
        references: [],
        productIds: [input.productId],
      });
      if (eligibility.status !== 'success')
        throw new InventoryDomainError('INVALID_INPUT', eligibility.message);
      const outputs = [...input.outputs].sort((a, b) =>
        BigInt(a.outputId) < BigInt(b.outputId) ? -1 : 1,
      );
      // Production's source locks serialize posting and revocation; the unique source key
      // also rejects a second command intent after HTTP replay records have expired.
      const [consumed] = await db.query<RowDataPacket[]>(
        `SELECT id FROM inbound_detail WHERE production_output_id IN (${outputs.map(() => '?').join(',')}) ORDER BY production_output_id FOR UPDATE`,
        outputs.map((output) => output.outputId),
      );
      if (consumed.length)
        throw new InventoryDomainError('CONFLICT', '所选产出已有入库记录，请刷新后重新选择');
      const target = await resolveTarget(db, input, context);
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
      const details: Array<{ outputId: string; quantity: string; detailId: string }> = [];
      for (const [index, output] of outputs.entries()) {
        const [detail] = await db.execute<ResultSetHeader>(
          `INSERT INTO inbound_detail(inbound_id,line_no,source_type,product_id,batch_id,target_mode,new_batch_key,production_output_id,item_code_snapshot,inbound_number,unit_snapshot,stock_status,created_by,updated_by)
           VALUES (?,?,'finished_product',?,?,?,?,?,?,?,?,'available',?,?)`,
          [
            inboundId,
            index + 1,
            input.productId,
            target.itemBatchId,
            input.target.mode === 'new_batch' ? 'new' : 'existing',
            input.target.mode === 'new_batch' ? `TASK:${input.productionBatchId}` : null,
            output.outputId,
            input.productCode,
            fixedIntegerQuantity(output.quantity),
            input.unit,
            context.actorId,
            context.actorId,
          ],
        );
        details.push({ ...output, detailId: String(detail.insertId) });
      }
      // Every source detail must exist before the first ledger posting freezes the order.
      for (const detail of details)
        await db.execute(
          `INSERT INTO inventory_transaction(product_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,remark,created_by)
           VALUES (?,?,'production_inbound',?,?,'available','inbound_detail',?,?,?,?)`,
          [
            input.productId,
            target.itemBatchId,
            fixedIntegerQuantity(detail.quantity),
            input.unit,
            detail.detailId,
            `INBOUND:${detail.detailId}`,
            input.remark ?? null,
            context.actorId,
          ],
        );
      await db.execute(
        "UPDATE inbound_order SET status='completed',inbound_at=CURRENT_TIMESTAMP,operator_id=?,version=version+1,updated_by=? WHERE id=?",
        [context.actorId, context.actorId, inboundId],
      );
      const result: TrackingOutputsResult = {
        inboundId,
        inboundNo,
        ...target,
        inboundQuantity: String(outputs.reduce((sum, output) => sum + BigInt(output.quantity), 0n)),
      };
      await writeTransactionalAudit(db, {
        logType: 'business',
        module: 'inventory',
        action: 'inventory.tracking-output.inbound',
        userId: context.actorId,
        targetType: 'inbound_order',
        targetId: inboundId,
        result: 'success',
        beforeData: null,
        afterData: { ...result, outputs: details },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return result;
    });
  }
}

async function resolveTarget(
  db: PoolConnection,
  input: TrackingOutputsInput,
  context: CommandContext,
): Promise<{ itemBatchId: string; batchCode: string }> {
  if (input.target.mode === 'existing_batch') {
    const [[batch]] = await db.query<BatchRow[]>(
      'SELECT id,product_id,unit_snapshot,item_code_snapshot,source_type,batch_status,batch_code,version FROM item_batch WHERE id=? FOR UPDATE',
      [input.target.itemBatchId],
    );
    if (!batch) throw new InventoryDomainError('NOT_FOUND', '目标成品库存批次不存在');
    if (batch.version !== input.target.version)
      throw new InventoryDomainError('CONCURRENT_MODIFICATION', '目标库存批次已变化，请刷新后重试');
    if (
      String(batch.product_id) !== input.productId ||
      batch.unit_snapshot !== input.unit ||
      batch.item_code_snapshot !== input.productCode ||
      batch.source_type !== 'finished_product' ||
      batch.batch_status !== 'available'
    )
      throw new InventoryDomainError('INVALID_STATE', '目标成品批次身份不符、被冻结或停用');
    const [sources] = await db.query<
      (RowDataPacket & {
        production_batch_id: string | number;
        detail_id: string | number;
        transaction_id: string | number | null;
      })[]
    >(
      `SELECT o.production_batch_id,d.id detail_id,t.id transaction_id FROM inbound_detail d
       JOIN inbound_order o ON o.id=d.inbound_id
       LEFT JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
         AND t.transaction_type='production_inbound' AND t.reversal_of_transaction_id IS NULL
         AND t.product_id=d.product_id AND t.batch_id=d.batch_id AND t.quantity=d.inbound_number
         AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status
       WHERE d.batch_id=? AND d.is_deleted=0 AND o.source_type='finished_product' AND o.status='completed'
       ORDER BY d.id,t.id FOR SHARE`,
      [input.target.itemBatchId],
    );
    if (
      !sources.length ||
      new Set(sources.map((source) => String(source.detail_id))).size !== sources.length ||
      sources.some(
        (source) =>
          String(source.production_batch_id) !== input.productionBatchId ||
          source.transaction_id === null,
      )
    )
      throw new InventoryDomainError('INVALID_STATE', '只能并入同一生产任务已有的成品批次');
    return { itemBatchId: String(batch.id), batchCode: batch.batch_code };
  }
  const batchCode = await allocateBusinessNumber(db, 'inventory_batch');
  const [batch] = await db.execute<ResultSetHeader>(
    `INSERT INTO item_batch(product_id,item_code_snapshot,unit_snapshot,batch_code,source_type,batch_status,remark,created_by,updated_by)
     VALUES (?,?,?,?,'finished_product','available',?,?,?)`,
    [
      input.productId,
      input.productCode,
      input.unit,
      batchCode,
      input.remark ?? null,
      context.actorId,
      context.actorId,
    ],
  );
  return { itemBatchId: String(batch.insertId), batchCode };
}

function validateInput(input: TrackingOutputsInput): void {
  const ids = [input.productionBatchId, input.workOrderId, input.productId];
  if (input.target.mode === 'existing_batch') ids.push(input.target.itemBatchId);
  if (
    ids.some((id) => !/^[1-9]\d*$/.test(id)) ||
    !input.productCode.trim() ||
    !input.unit.trim() ||
    input.outputs.length < 1 ||
    input.outputs.length > 100 ||
    new Set(input.outputs.map((output) => output.outputId)).size !== input.outputs.length ||
    (input.target.mode === 'existing_batch' &&
      (!Number.isSafeInteger(input.target.version) || input.target.version < 0)) ||
    input.outputs.some((output) => {
      const quantity = Number(output.quantity);
      return (
        !/^[1-9]\d*$/.test(output.outputId) ||
        !/^[1-9]\d*$/.test(output.quantity) ||
        !Number.isSafeInteger(quantity) ||
        quantity > MAX_PERSISTED_INTEGER_QUANTITY
      );
    })
  )
    throw new InventoryDomainError('INVALID_INPUT', '产出入库来源、目标或整笔数量无效');
}
