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
  batch_code: string;
  receipt_line_id: number | string;
  receipt_revision_id: number | string;
  scope_id: number | string;
  inspection_id: number | string;
  transaction_id: number | string;
  quantity: number | string;
};

@Injectable()
export class MysqlInventoryInboundQuery extends InventoryInboundQuery {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  getReceiptInboundFacts(input: { receiptLineIds: string[] }): Promise<ReceiptInboundFacts[]> {
    const ids = [...new Set(input.receiptLineIds)];
    if (ids.length > 100 || ids.some((id) => !/^[1-9]\d*$/.test(id)))
      throw new InventoryDomainError('INVALID_INPUT', '一次最多查询 100 个有效到货明细');
    if (!ids.length) return Promise.resolve([]);
    ids.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<FactRow[]>(
        `SELECT o.id inbound_id,o.inbound_no,o.inbound_at,d.id detail_id,d.batch_id,ib.batch_code,
         d.procurement_receipt_line_id receipt_line_id,d.procurement_receipt_revision_id receipt_revision_id,
         d.procurement_scope_id scope_id,d.procurement_inspection_id inspection_id,tx.id transaction_id,tx.quantity
         FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
         JOIN item_batch ib ON ib.id=d.batch_id AND ib.item_id=d.item_id AND ib.material_variant_id=d.material_variant_id
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
            batchId: null,
            batchCode: null,
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
        if (seenDetails.has(detailId) || (target.batchId !== null && target.batchId !== batchId))
          throw new InventoryDomainError('INVALID_STATE', '到货入库事实存在重复流水或多个内部批次');
        seenDetails.add(detailId);
        target.batchId = batchId;
        target.batchCode = row.batch_code;
        target.inboundQuantity = String(
          integerQuantity(target.inboundQuantity) + integerQuantity(row.quantity),
        );
        target.receipts.push({
          inboundId: String(row.inbound_id),
          inboundNo: row.inbound_no,
          inboundDetailId: detailId,
          transactionId: String(row.transaction_id),
          scopeId: String(row.scope_id),
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
