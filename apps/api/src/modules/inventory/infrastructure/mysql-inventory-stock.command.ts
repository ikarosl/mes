import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection, withTransaction } from '@company/database';
import {
  fixedIntegerQuantity,
  integerQuantity,
  MAX_PERSISTED_INTEGER_QUANTITY,
} from '@company/utils';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { StockStatus } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import {
  InventoryStockCommand,
  type InventoryMaterialBatchReference,
  type InventoryProductionMovement,
} from '../application/inventory-stock.command.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { currentMaterialNameSql } from './queries/material-name.sql.js';

type BatchRow = RowDataPacket & {
  id: number;
  item_id: number;
  material_variant_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  unit_snapshot: string;
  batch_code: string;
  batch_status: InventoryMaterialBatchReference['batchStatus'];
  available_quantity: string;
};

@Injectable()
export class MysqlInventoryStockCommand extends InventoryStockCommand {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly products: ProductInventoryEligibility,
  ) {
    super();
  }

  async lockMaterialBatches(ids: string[]): Promise<InventoryMaterialBatchReference[]> {
    const sorted = sortIds(ids);
    if (!sorted.length) return [];
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool) throw new Error('库存批次锁必须位于调用方事务中');
      const before = await this.materialBatchReferences(sorted);
      if (before.length !== sorted.length)
        throw new InventoryDomainError('NOT_FOUND', '库存物料批次不存在');
      const result = await this.products.lockHistoricalReferences({
        references: before.map((row) => ({
          itemId: row.itemId,
          materialVariantId: row.materialVariantId,
        })),
      });
      if (result.status !== 'success')
        throw new InventoryDomainError(
          result.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          result.message,
        );
      const [locked] = await db.query<
        (RowDataPacket & {
          id: number;
          item_id: number;
          material_variant_id: number;
          batch_status: InventoryMaterialBatchReference['batchStatus'];
        })[]
      >(
        `SELECT id,item_id,material_variant_id,batch_status FROM item_batch WHERE id IN (${sorted.map(() => '?').join(',')}) AND product_id IS NULL ORDER BY id FOR UPDATE`,
        sorted,
      );
      if (
        locked.length !== before.length ||
        locked.some((row) => {
          const previous = before.find((value) => value.id === String(row.id));
          return (
            !previous ||
            previous.itemId !== String(row.item_id) ||
            previous.materialVariantId !== String(row.material_variant_id)
          );
        })
      )
        throw new InventoryDomainError('CONCURRENT_MODIFICATION', '库存批次身份已变化，请刷新重试');
      const references = await this.materialBatchReferences(sorted);
      const currentById = new Map(locked.map((row) => [String(row.id), row]));
      for (const reference of references) {
        reference.batchStatus = currentById.get(reference.id)!.batch_status;
        reference.availableQuantity = await this.materialQuantity(reference.id, 'available');
      }
      return references;
    });
  }

  materialBatchReferences(ids: string[]): Promise<InventoryMaterialBatchReference[]> {
    if (!ids.length) return Promise.resolve([]);
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<BatchRow[]>(
        `SELECT ib.id,ib.item_id,ib.material_variant_id,ib.item_code_snapshot,ib.material_variant_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,
         ib.unit_snapshot,ib.batch_code,ib.batch_status,
         COALESCE((SELECT SUM(tx.quantity) FROM inventory_transaction tx WHERE tx.batch_id=ib.id AND tx.item_id=ib.item_id AND tx.material_variant_id=ib.material_variant_id AND tx.stock_status='available'),0) available_quantity
         FROM item_batch ib WHERE ib.id IN (${ids.map(() => '?').join(',')}) AND ib.product_id IS NULL ORDER BY ib.id`,
        ids,
      );
      return rows.map((row) => ({
        id: String(row.id),
        itemId: String(row.item_id),
        materialVariantId: String(row.material_variant_id),
        itemCode: row.item_code_snapshot,
        itemName: row.item_name,
        materialVariantCode: row.material_variant_code_snapshot,
        unit: row.unit_snapshot,
        batchCode: row.batch_code,
        batchStatus: row.batch_status,
        availableQuantity: fixedIntegerQuantity(row.available_quantity),
      }));
    });
  }

  materialTransactionReferences(
    referenceType: 'return_detail' | 'outbound_detail',
    detailIds: string[],
  ): Promise<Array<{ detailId: string; transactionId: string }>> {
    if (!detailIds.length) return Promise.resolve([]);
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<
        (RowDataPacket & { id: number; reference_detail_id: number })[]
      >(
        `SELECT id,reference_detail_id FROM inventory_transaction WHERE reference_type=? AND reference_detail_id IN (${detailIds.map(() => '?').join(',')}) AND transaction_type=? ORDER BY id`,
        [
          referenceType,
          ...detailIds,
          referenceType === 'return_detail'
            ? 'material_return_inbound'
            : 'production_material_outbound',
        ],
      );
      return rows.map((row) => ({
        detailId: String(row.reference_detail_id),
        transactionId: String(row.id),
      }));
    });
  }

  materialQuantity(batchId: string, stockStatus: StockStatus): Promise<string> {
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool) throw new Error('库存数量校验必须位于调用方事务中');
      const [[row]] = await db.query<(RowDataPacket & { quantity: string })[]>(
        'SELECT current_quantity quantity FROM inventory_batch_balance WHERE batch_id=? AND item_id IS NOT NULL AND stock_status=? FOR SHARE',
        [batchId, stockStatus],
      );
      return fixedIntegerQuantity(row?.quantity ?? 0);
    });
  }

  recordProductionOutbound(
    orderId: string,
    lines: InventoryProductionMovement[],
    context: CommandContext,
  ): Promise<void> {
    return this.record(orderId, lines, context, false);
  }
  recordProductionReturn(
    orderId: string,
    lines: InventoryProductionMovement[],
    context: CommandContext,
  ): Promise<void> {
    return this.record(orderId, lines, context, true);
  }
  private record(
    orderId: string,
    lines: InventoryProductionMovement[],
    context: CommandContext,
    returning: boolean,
  ): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      const batches = await this.lockMaterialBatches(lines.map((line) => line.batchId));
      const byId = new Map(batches.map((batch) => [batch.id, batch]));
      const totals = new Map<string, number>();
      for (const line of lines) {
        const quantity = integerQuantity(line.quantity);
        const batch = byId.get(line.batchId);
        if (
          !batch ||
          batch.itemId !== line.itemId ||
          batch.materialVariantId !== line.materialVariantId ||
          batch.unit !== line.unit ||
          quantity <= 0 ||
          quantity > MAX_PERSISTED_INTEGER_QUANTITY
        )
          throw new InventoryDomainError('INVALID_INPUT', '库存明细身份或数量无效');
        if (!returning && batch.batchStatus !== 'available')
          throw new InventoryDomainError('INVALID_STATE', '冻结或停用库存批次不能确认领料');
        totals.set(batch.id, (totals.get(batch.id) ?? 0) + quantity);
      }
      if (!returning)
        for (const [id, quantity] of totals) {
          if (quantity > integerQuantity(byId.get(id)!.availableQuantity))
            throw new InventoryDomainError(
              'INSUFFICIENT_AVAILABLE_STOCK',
              '库存账面可用数量不足，整单未扣减',
            );
        }
      for (const line of [...lines].sort(
        (a, b) =>
          compareId(a.materialVariantId, b.materialVariantId) ||
          compareId(a.batchId, b.batchId) ||
          compareId(a.detailId, b.detailId),
      )) {
        await db.execute(
          `INSERT INTO inventory_transaction (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,transaction_group_key,remark,created_by)
           VALUES (?,?,?,?,?,?,'available',?,?,?,?,?,?)`,
          [
            line.itemId,
            line.materialVariantId,
            line.batchId,
            returning ? 'material_return_inbound' : 'production_material_outbound',
            fixedIntegerQuantity(integerQuantity(line.quantity) * (returning ? 1 : -1)),
            line.unit,
            returning ? 'return_detail' : 'outbound_detail',
            line.detailId,
            returning ? `RETURN:${line.detailId}` : `PMO:${orderId}:${line.detailId}`,
            returning ? `RETURN:${orderId}` : null,
            line.remark ?? null,
            context.actorId,
          ],
        );
      }
    });
  }
}
const compareId = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
const sortIds = (ids: string[]): string[] => [...new Set(ids)].sort(compareId);
