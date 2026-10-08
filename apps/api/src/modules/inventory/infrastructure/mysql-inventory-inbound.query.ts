import type { InventoryInboundBatchCandidate, PageResult } from '@company/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import { integerQuantity } from '@company/utils';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { InventoryInboundQuery } from '../application/inventory-inbound.query.js';
import type { ReceiptInboundFacts } from '../application/inventory-purchase-inbound.types.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';

type FactRow = RowDataPacket & {
  inbound_id: number | string;
  inbound_no: string;
  inbound_at: Date;
  detail_id: number | string;
  batch_id: number | string;
  receipt_line_id: number | string;
  receipt_revision_id: number | string;
  inspection_id: number | string;
  allocation_id: number | string;
  transaction_id: number | string;
  quantity: number | string;
};

@Injectable()
export class MysqlInventoryInboundQuery extends InventoryInboundQuery {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listInboundBatchCandidates(input: {
    itemKind: 'material' | 'finished_product';
    materialVariantId?: string;
    productId?: string;
    unit: string;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PageResult<InventoryInboundBatchCandidate>> {
    const identity = input.itemKind === 'material' ? input.materialVariantId : input.productId;
    if (
      !identity ||
      !/^[1-9]\d*$/.test(identity) ||
      !input.unit.trim() ||
      input.unit.length > 20 ||
      !Number.isSafeInteger(input.page) ||
      input.page < 1 ||
      !Number.isSafeInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100
    )
      throw new InventoryDomainError('INVALID_INPUT', '批次候选身份或分页无效');
    const column = input.itemKind === 'material' ? 'material_variant_id' : 'product_id';
    const keyword = input.keyword?.trim();
    const where = `b.${column}=? AND b.unit_snapshot=? AND b.batch_status='available'${keyword ? ' AND b.batch_code LIKE ?' : ''}`;
    const params = keyword ? [identity, input.unit, `%${keyword}%`] : [identity, input.unit];
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM item_batch b WHERE ${where}`,
      params,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number | string;
        batch_code: string;
        unit_snapshot: string;
        current_quantity: string;
      })[]
    >(
      `SELECT b.id,b.batch_code,b.unit_snapshot,COALESCE(balance.current_quantity,0) current_quantity
      FROM item_batch b LEFT JOIN inventory_batch_balance balance ON balance.batch_id=b.id AND balance.stock_status='available'
      WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
      [...params, input.pageSize, (input.page - 1) * input.pageSize],
    );
    return {
      items: rows.map((row) => ({
        batchId: String(row.id),
        batchCode: row.batch_code,
        unit: row.unit_snapshot,
        batchStatus: 'available' as const,
        availableQuantity: String(row.current_quantity),
      })),
      total: Number(count?.total ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  getReceiptInboundFacts(input: { receiptLineIds: string[] }): Promise<ReceiptInboundFacts[]> {
    const ids = [...new Set(input.receiptLineIds)];
    if (ids.length > 100 || ids.some((id) => !/^[1-9]\d*$/.test(id)))
      throw new InventoryDomainError('INVALID_INPUT', '一次最多查询 100 个有效到货明细');
    if (!ids.length) return Promise.resolve([]);
    ids.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
    return withActiveConnection(this.pool, async (db) => {
      // 保留事实当前读；批次身份由组合外键保证，不为展示批号提前取得库批共享锁。
      // 共批入库只在确认写入时统一锁定目标批次，避免历史共享锁再升级为排他锁。
      const [rows] = await db.query<FactRow[]>(
        `SELECT o.id inbound_id,o.inbound_no,o.inbound_at,d.id detail_id,d.batch_id,
         d.procurement_receipt_line_id receipt_line_id,d.procurement_receipt_revision_id receipt_revision_id,
         d.procurement_allocation_id allocation_id,d.procurement_inspection_id inspection_id,tx.id transaction_id,tx.quantity
         FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
         JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
           AND tx.transaction_type='purchase_inbound' AND tx.quantity=d.inbound_number AND tx.quantity>0
           AND tx.batch_id=d.batch_id AND tx.item_id=d.item_id AND tx.material_variant_id=d.material_variant_id
           AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
         WHERE o.source_type='purchased' AND o.status='completed' AND d.stock_status='available'
           AND d.procurement_receipt_line_id IN (${ids.map(() => '?').join(',')})
         ORDER BY d.procurement_receipt_line_id,d.id,tx.id${db === this.pool ? '' : ' FOR SHARE'}`,
        ids,
      );
      const byReceipt = new Map(
        ids.map((receiptLineId): [string, ReceiptInboundFacts] => [
          receiptLineId,
          {
            receiptLineId,
            inboundQuantity: '0',
            receipts: [],
          },
        ]),
      );
      const seenDetails = new Set<string>();
      for (const row of rows) {
        const target = byReceipt.get(String(row.receipt_line_id))!;
        const batchId = String(row.batch_id);
        const detailId = String(row.detail_id);
        if (seenDetails.has(detailId))
          throw new InventoryDomainError('INVALID_STATE', '到货入库事实存在重复正流水');
        seenDetails.add(detailId);
        target.inboundQuantity = String(
          integerQuantity(target.inboundQuantity) + integerQuantity(row.quantity),
        );
        target.receipts.push({
          batchId,
          inboundId: String(row.inbound_id),
          inboundNo: row.inbound_no,
          inboundDetailId: detailId,
          transactionId: String(row.transaction_id),

          allocationId: String(row.allocation_id),
          inspectionId: String(row.inspection_id),
          receiptRevisionId: String(row.receipt_revision_id),
          quantity: String(row.quantity),
          confirmedAt: toBeijingISOString(row.inbound_at),
        });
      }
      return ids.map((id) => byReceipt.get(id)!);
    });
  }
}
