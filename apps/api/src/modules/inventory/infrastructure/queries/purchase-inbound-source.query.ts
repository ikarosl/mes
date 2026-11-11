import type { PurchaseInboundDetailItem } from '@company/contracts';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
type Source = NonNullable<PurchaseInboundDetailItem['procurementSource']>;
type SourceRow = RowDataPacket & {
  inbound_detail_id: number;
  receipt_id: number;
  receipt_no: string;
  receipt_line_id: number;
  purchase_order_id: number;
  purchase_no: string;
  purchase_order_line_id: number;
};
export async function loadPurchaseInboundSources(
  db: Pool | PoolConnection,
  detailIds: string[],
): Promise<Map<string, Source>> {
  const result = new Map<string, Source>();
  if (!detailIds.length) return result;
  const [rows] = await db.query<SourceRow[]>(
    `SELECT detail.id inbound_detail_id,receipt.id receipt_id,receipt.receipt_no,receipt_line.id receipt_line_id,
       receipt_order.id purchase_order_id,receipt_order.purchase_no,receipt_line.purchase_order_line_id
     FROM inbound_detail detail JOIN procurement_receipt_line receipt_line ON receipt_line.id=detail.procurement_receipt_line_id
     JOIN procurement_receipt receipt ON receipt.id=receipt_line.receipt_id
     JOIN procurement_order receipt_order ON receipt_order.id=receipt_line.purchase_order_id
     WHERE detail.id IN (${detailIds.map(() => '?').join(',')})`,
    detailIds,
  );
  for (const row of rows)
    result.set(String(row.inbound_detail_id), {
      receipt: {
        receiptId: String(row.receipt_id),
        receiptNo: row.receipt_no,
        receiptLineId: String(row.receipt_line_id),
        purchaseOrderNo: row.purchase_no,
      },
      purchaseOrder: {
        purchaseOrderId: String(row.purchase_order_id),
        purchaseOrderNo: row.purchase_no,
        purchaseOrderLineId: String(row.purchase_order_line_id),
      },
    });
  return result;
}
export async function loadPurchaseInboundSupplierIds(
  db: Pool | PoolConnection,
  detailIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!detailIds.length) return result;
  const [rows] = await db.query<
    (RowDataPacket & { inbound_detail_id: number; supplier_id: number })[]
  >(
    `SELECT detail.id inbound_detail_id,source_order.supplier_id FROM inbound_detail detail
     JOIN procurement_receipt_line receipt_line ON receipt_line.id=detail.procurement_receipt_line_id
     JOIN procurement_order source_order ON source_order.id=receipt_line.purchase_order_id
     WHERE detail.id IN (${detailIds.map(() => '?').join(',')})`,
    detailIds,
  );
  for (const row of rows) result.set(String(row.inbound_detail_id), String(row.supplier_id));
  return result;
}
