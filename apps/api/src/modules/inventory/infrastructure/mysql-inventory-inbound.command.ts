import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import {
  fixedIntegerQuantity,
  integerQuantity,
  MAX_PERSISTED_INTEGER_QUANTITY,
} from '@company/utils';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import {
  InventoryInboundCommand,
  type FinishedOutputInput,
  type FinishedOutputResult,
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

  confirmFinishedOutput(
    input: FinishedOutputInput,
    context: CommandContext,
  ): Promise<FinishedOutputResult> {
    validateFinished(input);
    return withActiveConnection(this.pool, async (connection) => {
      if (connection === this.pool) throw new Error('成品入库确认必须位于 Production 同池事务中');
      const db = connection as PoolConnection;
      const eligibility = await this.products.lockHistoricalReferences({
        references: [],
        productIds: [input.productId],
      });
      if (eligibility.status !== 'success')
        throw new InventoryDomainError('INVALID_INPUT', eligibility.message);
      const existingIds = [
        ...new Set(
          input.details.flatMap((detail) =>
            detail.target.mode === 'existing' ? [detail.target.batchId] : [],
          ),
        ),
      ].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
      const [existingRows] = existingIds.length
        ? await db.query<
            (RowDataPacket & {
              id: string | number;
              product_id: string | number;
              unit_snapshot: string;
              batch_status: string;
              batch_code: string;
            })[]
          >(
            `SELECT id,product_id,unit_snapshot,batch_status,batch_code FROM item_batch WHERE id IN (${existingIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`,
            existingIds,
          )
        : [[] as never[]];
      const existing = new Map(existingRows.map((row) => [String(row.id), row]));
      const newByKey = new Map<string, { batchId: string; identity: string }>();
      const resolved = new Map<FinishedOutputInput['details'][number], string>();
      for (const detail of input.details) {
        let batchId: string;
        if (detail.target.mode === 'existing') {
          const batch = existing.get(detail.target.batchId);
          if (
            !batch ||
            String(batch.product_id) !== input.productId ||
            batch.unit_snapshot !== input.unit ||
            batch.batch_status !== 'available'
          )
            throw new InventoryDomainError(
              'INVALID_STATE',
              '目标成品批次身份、单位或状态不允许入库',
            );
          batchId = detail.target.batchId;
        } else {
          const identity = `${input.productId}:${input.unit}:${detail.target.batchCode ?? ''}`;
          const prior = newByKey.get(detail.target.clientKey);
          if (prior && prior.identity !== identity)
            throw new InventoryDomainError(
              'INVALID_INPUT',
              '共用新批次的成品身份、单位或批号不一致',
            );
          if (prior) batchId = prior.batchId;
          else {
            let created: ResultSetHeader;
            try {
              [created] = await db.execute<ResultSetHeader>(
                `INSERT INTO item_batch(product_id,item_code_snapshot,unit_snapshot,batch_code,source_type,batch_status,remark,created_by,updated_by)
               VALUES (?,?,?,?,'finished_product','available',?,?,?)`,
                [
                  input.productId,
                  input.productCode,
                  input.unit,
                  detail.target.batchCode?.trim() ?? code('IB'),
                  input.remark ?? null,
                  context.actorId,
                  context.actorId,
                ],
              );
            } catch (error) {
              if (isDuplicate(error))
                throw new InventoryDomainError('CONFLICT', '目标成品批号已存在，请刷新后重试');
              throw error;
            }
            batchId = String(created.insertId);
            newByKey.set(detail.target.clientKey, { batchId, identity });
          }
        }
        resolved.set(detail, batchId);
      }
      const inboundNo = code('FI');
      const [order] = await db.execute<ResultSetHeader>(
        `INSERT INTO inbound_order(inbound_no,source_type,work_order_id,production_batch_id,product_id,status,inbound_at,operator_id,remark,created_by,updated_by)
         VALUES (?,'finished_product',?,?,?,'pending',CURRENT_TIMESTAMP,?,?,?,?)`,
        [
          inboundNo,
          input.workOrderId,
          input.productionBatchId,
          input.productId,
          context.actorId,
          input.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const inboundId = String(order.insertId);
      const details: FinishedOutputResult['details'] = [];
      for (const detail of input.details) {
        const batchId = resolved.get(detail)!;
        const [insert] = await db.execute<ResultSetHeader>(
          `INSERT INTO inbound_detail(inbound_id,product_id,batch_id,production_output_allocation_id,item_code_snapshot,inbound_number,unit_snapshot,stock_status,created_by)
           VALUES (?,?,?,?,?,?,?,'available',?)`,
          [
            inboundId,
            input.productId,
            batchId,
            detail.allocationId,
            input.productCode,
            fixedIntegerQuantity(detail.quantity),
            input.unit,
            context.actorId,
          ],
        );
        const inboundDetailId = String(insert.insertId);
        const [transaction] = await db.execute<ResultSetHeader>(
          `INSERT INTO inventory_transaction(product_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,remark,created_by)
           VALUES (?,?,'production_inbound',?,?,'available','inbound_detail',?,?,?,?)`,
          [
            input.productId,
            batchId,
            fixedIntegerQuantity(detail.quantity),
            input.unit,
            inboundDetailId,
            `FGI:${inboundDetailId}`,
            input.remark ?? null,
            context.actorId,
          ],
        );
        details.push({
          detailKey: detail.detailKey,
          allocationId: detail.allocationId,
          batchId,
          inboundDetailId,
          transactionId: String(transaction.insertId),
        });
      }
      await db.execute("UPDATE inbound_order SET status='completed' WHERE id=?", [inboundId]);
      await writeTransactionalAudit(db, {
        logType: 'business',
        module: 'inventory',
        action: 'inventory.finished-inbound.confirm',
        userId: context.actorId,
        targetType: 'inbound_order',
        targetId: inboundId,
        result: 'success',
        beforeData: null,
        afterData: { inboundNo, details },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return { inboundId, inboundNo, details };
    });
  }

  readFinishedAllocationReceipts(
    allocationIds: string[],
    lock: boolean,
  ): Promise<Record<string, string>> {
    const ids = [...new Set(allocationIds)];
    if (ids.length > 100 || ids.some((id) => !/^[1-9]\d*$/.test(id)))
      throw new InventoryDomainError('INVALID_INPUT', '一次最多查询 100 份有效成品授权');
    if (!ids.length) return Promise.resolve({});
    return withActiveConnection(this.pool, async (db) => {
      if (lock && db === this.pool) throw new Error('成品授权消费事实锁必须位于调用方事务中');
      const [rows] = await db.query<
        (RowDataPacket & { allocation_id: string | number; quantity: string | number })[]
      >(
        `SELECT d.production_output_allocation_id allocation_id,t.quantity
         FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
         JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
           AND t.transaction_type='production_inbound' AND t.product_id=d.product_id AND t.batch_id=d.batch_id
           AND t.quantity=d.inbound_number AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status
         WHERE o.status='completed' AND o.source_type='finished_product'
           AND d.production_output_allocation_id IN (${ids.map(() => '?').join(',')})
         ORDER BY d.production_output_allocation_id,d.id${lock ? ' FOR SHARE' : ''}`,
        ids,
      );
      const totals: Record<string, string> = Object.fromEntries(ids.map((id) => [id, '0']));
      for (const row of rows) {
        const id = String(row.allocation_id);
        totals[id] = fixedIntegerQuantity(
          integerQuantity(totals[id] ?? '0') + integerQuantity(row.quantity),
        );
      }
      return totals;
    });
  }

  readFinishedTaskAllocationReceipts(
    batchId: string,
    lock: boolean,
  ): Promise<Record<string, string>> {
    if (!/^[1-9]\d*$/.test(batchId))
      throw new InventoryDomainError('INVALID_INPUT', '任务身份无效');
    return withActiveConnection(this.pool, async (db) => {
      if (lock && db === this.pool) throw new Error('成品任务收货事实锁必须位于调用方事务中');
      const [rows] = await db.query<
        (RowDataPacket & { allocation_id: number | string; quantity: number | string })[]
      >(
        `SELECT d.production_output_allocation_id allocation_id,t.quantity
         FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
         JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
           AND t.transaction_type='production_inbound' AND t.product_id=d.product_id AND t.batch_id=d.batch_id
           AND t.quantity=d.inbound_number AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status
         WHERE o.production_batch_id=? AND o.status='completed' AND o.source_type='finished_product'
         ORDER BY o.id,d.id${lock ? ' FOR SHARE' : ''}`,
        [batchId],
      );
      const totals: Record<string, string> = {};
      for (const row of rows) {
        const id = String(row.allocation_id);
        totals[id] = fixedIntegerQuantity(
          integerQuantity(totals[id] ?? '0') + integerQuantity(row.quantity),
        );
      }
      return totals;
    });
  }
}

function validateFinished(input: FinishedOutputInput): void {
  if (
    !/^[1-9]\d*$/.test(input.productionBatchId) ||
    !/^[1-9]\d*$/.test(input.workOrderId) ||
    !/^[1-9]\d*$/.test(input.productId) ||
    !input.productCode.trim() ||
    !input.unit.trim() ||
    !input.details.length ||
    input.details.length > 100
  )
    throw new InventoryDomainError('INVALID_INPUT', '成品入库来源或明细无效');
  const keys = new Map<string, string>();
  const detailKeys = new Set<string>();
  for (const detail of input.details) {
    const quantity = Number(detail.quantity);
    if (
      !/^[1-9]\d*$/.test(detail.allocationId) ||
      !/^[1-9]\d*$/.test(detail.revisionId) ||
      !detail.detailKey.trim() ||
      detail.detailKey.length > 100 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > MAX_PERSISTED_INTEGER_QUANTITY ||
      !['self_made', 'production_extra'].includes(detail.sourceType)
    )
      throw new InventoryDomainError('INVALID_INPUT', '成品授权或数量无效');
    if (detailKeys.has(detail.detailKey))
      throw new InventoryDomainError('INVALID_INPUT', '成品入库明细标识不能重复');
    detailKeys.add(detail.detailKey);
    if (detail.target.mode === 'existing') {
      if (!/^[1-9]\d*$/.test(detail.target.batchId))
        throw new InventoryDomainError('INVALID_INPUT', '目标批次无效');
    } else {
      if (
        !detail.target.clientKey.trim() ||
        detail.target.clientKey.length > 100 ||
        (detail.target.batchCode !== undefined &&
          (!detail.target.batchCode.trim() || detail.target.batchCode.length > 100))
      )
        throw new InventoryDomainError('INVALID_INPUT', '新批次标识或批号无效');
      const identity = `${input.productId}:${input.unit}:${detail.target.batchCode ?? ''}`;
      const previous = keys.get(detail.target.clientKey);
      if (previous && previous !== identity)
        throw new InventoryDomainError('INVALID_INPUT', '共用新批次的身份不一致');
      keys.set(detail.target.clientKey, identity);
    }
  }
}
const code = (prefix: 'FI' | 'IB') =>
  `${prefix}-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

function isDuplicate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { code?: string; cause?: unknown };
  return value.code === 'ER_DUP_ENTRY' || (value.cause !== undefined && isDuplicate(value.cause));
}
