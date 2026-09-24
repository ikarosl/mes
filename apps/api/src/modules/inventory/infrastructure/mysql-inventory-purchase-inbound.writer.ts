import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import {
  fixedIntegerQuantity,
  integerQuantity,
  MAX_PERSISTED_INTEGER_QUANTITY,
} from '@company/utils';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import { InventoryStockCommand } from '../application/inventory-stock.command.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
  PurchaseReceiptInboundLine,
} from '../application/inventory-purchase-inbound.types.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';

@Injectable()
export class MysqlInventoryPurchaseInboundWriter {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly products: ProductInventoryEligibility,
    private readonly stock: InventoryStockCommand,
  ) {}

  confirm(
    input: ConfirmPurchaseReceiptInput,
    context: CommandContext,
  ): Promise<ConfirmPurchaseReceiptResult> {
    validateInput(input);
    return withActiveConnection(this.pool, async (connection) => {
      if (connection === this.pool) throw new Error('采购入库确认必须位于调用方同池事务中');
      const db = connection as PoolConnection;
      const eligibility = await this.products.requirePurchasableReferences({
        references: input.details.map((line) => ({
          itemId: line.itemId,
          materialVariantId: line.materialVariantId,
        })),
      });
      if (eligibility.status !== 'success')
        throw new InventoryDomainError(
          eligibility.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          eligibility.message,
        );
      const eligibleByVariant = new Map(
        eligibility.value.map((reference) => [reference.materialVariantId, reference]),
      );
      for (const line of input.details) {
        const reference = eligibleByVariant.get(line.materialVariantId);
        if (!reference || reference.itemId !== line.itemId)
          throw new InventoryDomainError('INVALID_INPUT', '入库物料与精确版本身份不一致');
      }
      const batchIds = uniqueSorted(
        input.details.flatMap((line) => (line.batchId ? [line.batchId] : [])),
      );
      const locked = await this.stock.lockMaterialBatches(batchIds);
      const lockedById = new Map(locked.map((batch) => [batch.id, batch]));
      const sourceByBatch = new Map<string, string>();
      if (batchIds.length) {
        const [rows] = await db.query<
          (RowDataPacket & { id: number | string; source_type: string })[]
        >(
          `SELECT id,source_type FROM item_batch WHERE id IN (${batchIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`,
          batchIds,
        );
        for (const row of rows) sourceByBatch.set(String(row.id), row.source_type);
      }
      const receiptBatches = new Map<string, string>();
      const batchQuantities = new Map<string, number>();
      const ordered = [...input.details].sort(compareLines);
      for (const line of ordered) {
        const existing = line.batchId ? lockedById.get(line.batchId) : undefined;
        if (
          line.batchId &&
          (!existing ||
            existing.itemId !== line.itemId ||
            existing.materialVariantId !== line.materialVariantId ||
            existing.unit !== line.unit ||
            existing.batchStatus !== 'available' ||
            sourceByBatch.get(line.batchId) !== 'purchased')
        )
          throw new InventoryDomainError(
            'INVALID_STATE',
            '到货绑定的库存批次身份不符、被冻结或停用',
          );
        let batchId = receiptBatches.get(line.receiptLineId) ?? line.batchId;
        if (!batchId) batchId = await createBatch(db, input, line, context);
        receiptBatches.set(line.receiptLineId, batchId);
        batchQuantities.set(
          batchId,
          (batchQuantities.get(batchId) ?? 0) + integerQuantity(line.quantity),
        );
      }
      for (const [batchId, added] of batchQuantities) {
        const available = integerQuantity(lockedById.get(batchId)?.availableQuantity ?? '0');
        if (available + added > MAX_PERSISTED_INTEGER_QUANTITY)
          throw new InventoryDomainError('INVALID_INPUT', '入库后批次可用数量超过允许上限');
      }
      const inboundNo = automaticCode('PI');
      const [order] = await db.execute<ResultSetHeader>(
        `INSERT INTO inbound_order(inbound_no,source_type,provider,status,inbound_at,operator_id,remark,created_by,updated_by)
         VALUES (?,'purchased',?,'completed',CURRENT_TIMESTAMP,?,?,?,?)`,
        [
          inboundNo,
          input.provider.trim(),
          context.actorId,
          input.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const inboundId = String(order.insertId);
      const details: ConfirmPurchaseReceiptResult['details'] = [];
      for (const line of ordered) {
        const batchId = receiptBatches.get(line.receiptLineId)!;
        const [detail] = await db.execute<ResultSetHeader>(
          `INSERT INTO inbound_detail(inbound_id,item_id,material_variant_id,batch_id,item_code_snapshot,inbound_number,unit_snapshot,stock_status,
           procurement_receipt_line_id,procurement_receipt_revision_id,procurement_inspection_id,procurement_allocation_id,created_by)
           VALUES (?,?,?,?,?,?,?,'available',?,?,?,?,?)`,
          [
            inboundId,
            line.itemId,
            line.materialVariantId,
            batchId,
            line.itemCode,
            fixedIntegerQuantity(line.quantity),
            line.unit,
            line.receiptLineId,
            line.receiptRevisionId,
            line.inspectionId,
            line.allocationId,
            context.actorId,
          ],
        );
        const inboundDetailId = String(detail.insertId);
        const [transaction] = await db.execute<ResultSetHeader>(
          `INSERT INTO inventory_transaction(item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,
           reference_type,reference_detail_id,idempotency_key,remark,created_by)
           VALUES (?,?,?,'purchase_inbound',?,?,'available','inbound_detail',?,?,?,?)`,
          [
            line.itemId,
            line.materialVariantId,
            batchId,
            fixedIntegerQuantity(line.quantity),
            line.unit,
            inboundDetailId,
            `PRI:${inboundDetailId}`,
            input.remark ?? null,
            context.actorId,
          ],
        );
        details.push({
          receiptLineId: line.receiptLineId,
          allocationId: line.allocationId,
          batchId,
          inboundDetailId,
          transactionId: String(transaction.insertId),
        });
      }
      await writeTransactionalAudit(db, {
        logType: 'business',
        module: 'inventory',
        action: 'inventory.purchase-inbound.confirm',
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
}

async function createBatch(
  db: PoolConnection,
  input: ConfirmPurchaseReceiptInput,
  line: PurchaseReceiptInboundLine,
  context: CommandContext,
): Promise<string> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO item_batch(item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,
     source_type,provider,batch_status,remark,created_by,updated_by)
     VALUES (?,?,?,?,?,?,'purchased',?,'available',?,?,?)`,
    [
      line.itemId,
      line.materialVariantId,
      line.itemCode,
      line.materialVariantCode,
      line.unit,
      automaticCode('IB'),
      input.provider.trim(),
      input.remark ?? null,
      context.actorId,
      context.actorId,
    ],
  );
  return String(result.insertId);
}

function validateInput(input: ConfirmPurchaseReceiptInput): void {
  if (
    !input.provider.trim() ||
    input.provider.trim().length > 100 ||
    !input.details.length ||
    input.details.length > 100
  )
    throw new InventoryDomainError('INVALID_INPUT', '供应商名称或入库明细数量无效');
  const allocationIds = new Set<string>();
  const receipts = new Map<string, PurchaseReceiptInboundLine>();
  const boundBatches = new Map<string, string>();
  for (const line of input.details) {
    const ids = [
      line.receiptLineId,
      line.receiptRevisionId,
      line.inspectionId,
      line.allocationId,
      line.itemId,
      line.materialVariantId,
    ];
    if (line.batchId !== null) ids.push(line.batchId);
    const quantity = Number(line.quantity);
    if (
      ids.some((id) => !/^[1-9]\d*$/.test(id)) ||
      allocationIds.has(line.allocationId) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > MAX_PERSISTED_INTEGER_QUANTITY ||
      !line.itemCode.trim() ||
      !line.materialVariantCode.trim() ||
      !line.unit.trim()
    )
      throw new InventoryDomainError('INVALID_INPUT', '入库范围、物料身份或整数数量无效');
    allocationIds.add(line.allocationId);
    const prior = receipts.get(line.receiptLineId);
    if (
      prior &&
      (prior.itemId !== line.itemId ||
        prior.materialVariantId !== line.materialVariantId ||
        prior.itemCode !== line.itemCode ||
        prior.materialVariantCode !== line.materialVariantCode ||
        prior.unit !== line.unit ||
        prior.batchId !== line.batchId)
    )
      throw new InventoryDomainError('INVALID_INPUT', '同一到货的物料版本、单位及批次绑定必须一致');
    if (
      line.batchId &&
      boundBatches.has(line.batchId) &&
      boundBatches.get(line.batchId) !== line.receiptLineId
    )
      throw new InventoryDomainError('INVALID_INPUT', '不同到货明细不能复用同一内部库存批次');
    if (line.batchId) boundBatches.set(line.batchId, line.receiptLineId);
    receipts.set(line.receiptLineId, line);
  }
}
const automaticCode = (prefix: 'PI' | 'IB'): string =>
  `${prefix}-${toBeijingISOString(Date.now()).slice(0, 10).replaceAll('-', '')}-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
const compareId = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
const uniqueSorted = (ids: string[]): string[] => [...new Set(ids)].sort(compareId);
const compareLines = (a: PurchaseReceiptInboundLine, b: PurchaseReceiptInboundLine): number =>
  compareId(a.materialVariantId, b.materialVariantId) ||
  compareId(a.receiptLineId, b.receiptLineId) ||
  compareId(a.allocationId, b.allocationId);
