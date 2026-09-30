import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import { fixedIntegerQuantity, MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
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
        input.details.flatMap((line) =>
          line.target.mode === 'existing' ? [line.target.batchId] : [],
        ),
      );
      const locked = await this.stock.lockMaterialBatches(batchIds);
      const lockedById = new Map(locked.map((batch) => [batch.id, batch]));
      const resolved = new Map<PurchaseReceiptInboundLine, string>();
      const newByKey = new Map<string, { batchId: string; identity: string }>();
      const ordered = [...input.details].sort(compareLines);
      for (const line of ordered) {
        let batchId: string;
        if (line.target.mode === 'existing') {
          const existing = lockedById.get(line.target.batchId);
          if (
            !existing ||
            existing.itemId !== line.itemId ||
            existing.materialVariantId !== line.materialVariantId ||
            existing.unit !== line.unit ||
            existing.batchStatus !== 'available'
          )
            throw new InventoryDomainError('INVALID_STATE', '目标库存批次身份不符、被冻结或停用');
          batchId = line.target.batchId;
        } else {
          const identity = `${line.itemId}:${line.materialVariantId}:${line.unit}`;
          const prior = newByKey.get(line.target.clientKey);
          if (prior && prior.identity !== identity)
            throw new InventoryDomainError('INVALID_INPUT', '共用新批次的物料身份或单位不一致');
          batchId = prior?.batchId ?? (await createBatch(db, input, line, context));
          newByKey.set(line.target.clientKey, { batchId, identity });
        }
        resolved.set(line, batchId);
      }
      const inboundNo = await allocateBusinessNumber(db, 'purchase_inbound');
      const [order] = await db.execute<ResultSetHeader>(
        `INSERT INTO inbound_order(inbound_no,source_type,status,inbound_at,operator_id,remark,created_by,updated_by)
         VALUES (?,'purchased','completed',CURRENT_TIMESTAMP,?,?,?,?)`,
        [inboundNo, context.actorId, input.remark ?? null, context.actorId, context.actorId],
      );
      const inboundId = String(order.insertId);
      const details: ConfirmPurchaseReceiptResult['details'] = [];
      for (const line of ordered) {
        const batchId = resolved.get(line)!;
        const [detail] = await db.execute<ResultSetHeader>(
          `INSERT INTO inbound_detail(inbound_id,item_id,material_variant_id,batch_id,item_code_snapshot,inbound_number,unit_snapshot,stock_status,supplier_name_snapshot,
           procurement_receipt_line_id,procurement_receipt_revision_id,procurement_inspection_id,procurement_allocation_id,created_by)
           VALUES (?,?,?,?,?,?,?,'available',?,?,?,?,?,?)`,
          [
            inboundId,
            line.itemId,
            line.materialVariantId,
            batchId,
            line.itemCode,
            fixedIntegerQuantity(line.quantity),
            line.unit,
            line.supplierNameSnapshot.trim(),
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
          detailKey: line.detailKey,
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
  let result: ResultSetHeader;
  try {
    [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO item_batch(item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,
     source_type,provider,batch_status,remark,created_by,updated_by)
     VALUES (?,?,?,?,?,?,'purchased',?,'available',?,?,?)`,
      [
        line.itemId,
        line.materialVariantId,
        line.itemCode,
        line.materialVariantCode,
        line.unit,
        await allocateBusinessNumber(db, 'inventory_batch'),
        null,
        input.remark ?? null,
        context.actorId,
        context.actorId,
      ],
    );
  } catch (error) {
    if (isDuplicate(error))
      throw new InventoryDomainError('CONFLICT', '目标内部批号已存在，请刷新后重试');
    throw error;
  }
  return String(result.insertId);
}
function isDuplicate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { code?: string; cause?: unknown };
  return value.code === 'ER_DUP_ENTRY' || (value.cause !== undefined && isDuplicate(value.cause));
}

function validateInput(input: ConfirmPurchaseReceiptInput): void {
  if (!input.details.length || input.details.length > 100)
    throw new InventoryDomainError('INVALID_INPUT', '入库明细数量无效');
  const newTargets = new Map<string, string>();
  const detailKeys = new Set<string>();
  for (const line of input.details) {
    const ids = [
      line.receiptLineId,
      line.receiptRevisionId,
      line.inspectionId,
      line.allocationId,
      line.itemId,
      line.materialVariantId,
    ];
    if (line.target.mode === 'existing') ids.push(line.target.batchId);
    const quantity = Number(line.quantity);
    if (
      ids.some((id) => !/^[1-9]\d*$/.test(id)) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > MAX_PERSISTED_INTEGER_QUANTITY ||
      !line.detailKey.trim() ||
      line.detailKey.length > 100 ||
      !line.itemCode.trim() ||
      !line.materialVariantCode.trim() ||
      !line.unit.trim() ||
      !line.supplierNameSnapshot.trim() ||
      line.supplierNameSnapshot.trim().length > 100
    )
      throw new InventoryDomainError('INVALID_INPUT', '入库范围、供应商、物料身份或整数数量无效');
    if (detailKeys.has(line.detailKey))
      throw new InventoryDomainError('INVALID_INPUT', '入库明细标识不能重复');
    detailKeys.add(line.detailKey);
    if (line.target.mode === 'new') {
      if (!line.target.clientKey.trim() || line.target.clientKey.length > 100)
        throw new InventoryDomainError('INVALID_INPUT', '新批次标识无效');
      const identity = `${line.itemId}:${line.materialVariantId}:${line.unit}`;
      const prior = newTargets.get(line.target.clientKey);
      if (prior && prior !== identity)
        throw new InventoryDomainError('INVALID_INPUT', '共用新批次的物料身份或单位不一致');
      newTargets.set(line.target.clientKey, identity);
    }
  }
}
const compareId = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
const uniqueSorted = (ids: string[]): string[] => [...new Set(ids)].sort(compareId);
const compareLines = (a: PurchaseReceiptInboundLine, b: PurchaseReceiptInboundLine): number =>
  compareId(a.materialVariantId, b.materialVariantId) ||
  compareId(a.receiptLineId, b.receiptLineId) ||
  compareId(a.allocationId, b.allocationId);
