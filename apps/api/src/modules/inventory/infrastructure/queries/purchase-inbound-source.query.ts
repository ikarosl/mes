import type { PurchaseInboundDetailItem } from '@company/contracts';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../../common/time/date-time.js';

type Source = NonNullable<PurchaseInboundDetailItem['procurementSource']>;
type SourceRow = RowDataPacket & {
  inbound_detail_id: number;
  receipt_id: number;
  receipt_no: string;
  receipt_line_id: number;
  receipt_line_no: number;
  receipt_purchase_no: string;
  purchase_order_id: number;
  purchase_no: string;
  purchase_order_line_id: number;
  purchase_order_line_no: number;
  inspection_id: number;
  case_id: number;
  inspected_at: Date;
};

/** Display-only provenance for the exact immutable references saved on each inbound detail. */
export async function loadPurchaseInboundSources(
  db: Pool | PoolConnection,
  detailIds: string[],
): Promise<Map<string, Source>> {
  const sources = new Map<string, Source>();
  if (!detailIds.length) return sources;
  const [rows] = await db.query<SourceRow[]>(
    `SELECT detail.id inbound_detail_id,receipt.id receipt_id,receipt.receipt_no,
      receipt_line.id receipt_line_id,receipt_line.line_no receipt_line_no,
      receipt_order.purchase_no receipt_purchase_no,
      assigned_order.id purchase_order_id,assigned_order.purchase_no,
      assigned_line.id purchase_order_line_id,assigned_line.line_no purchase_order_line_no,
      inspection.id inspection_id,inspection.case_id,inspection.inspected_at
     FROM inbound_detail detail
     JOIN procurement_receipt_line receipt_line ON receipt_line.id=detail.procurement_receipt_line_id
     JOIN procurement_receipt receipt ON receipt.id=receipt_line.receipt_id
     JOIN procurement_order receipt_order ON receipt_order.id=receipt.purchase_order_id
     JOIN procurement_receipt_allocation allocation ON allocation.id=detail.procurement_allocation_id
       AND allocation.receipt_line_id=receipt_line.id
     JOIN procurement_order_line assigned_line ON assigned_line.id=allocation.purchase_order_line_id
     JOIN procurement_order assigned_order ON assigned_order.id=assigned_line.purchase_order_id
     JOIN quality_inspection_record inspection ON inspection.id=detail.procurement_inspection_id
       AND inspection.receipt_line_id=receipt_line.id
     JOIN quality_inspection_case inspection_case ON inspection_case.id=inspection.case_id
       AND inspection_case.receipt_line_id=receipt_line.id AND inspection_case.source_kind='incoming'
     WHERE detail.id IN (${detailIds.map(() => '?').join(',')})`,
    detailIds,
  );
  for (const row of rows)
    sources.set(String(row.inbound_detail_id), {
      receipt: {
        receiptId: String(row.receipt_id),
        receiptNo: row.receipt_no,
        receiptLineId: String(row.receipt_line_id),
        receiptLineNo: Number(row.receipt_line_no),
        purchaseOrderNo: row.receipt_purchase_no,
      },
      purchaseOrder: {
        purchaseOrderId: String(row.purchase_order_id),
        purchaseOrderNo: row.purchase_no,
        purchaseOrderLineId: String(row.purchase_order_line_id),
        purchaseOrderLineNo: Number(row.purchase_order_line_no),
      },
      inspection: {
        inspectionId: String(row.inspection_id),
        caseId: String(row.case_id),
        inspectedAt: toBeijingISOString(row.inspected_at),
      },
    });
  return sources;
}

/** Supplier identity follows the purchase line assigned by this immutable allocation. */
export async function loadPurchaseInboundSupplierIds(
  db: Pool | PoolConnection,
  detailIds: string[],
): Promise<Map<string, string>> {
  const supplierIds = new Map<string, string>();
  if (!detailIds.length) return supplierIds;
  const [rows] = await db.query<
    (RowDataPacket & { inbound_detail_id: number; supplier_id: number })[]
  >(
    `SELECT detail.id inbound_detail_id,assigned_line.supplier_id
     FROM inbound_detail detail
     JOIN procurement_receipt_allocation allocation ON allocation.id=detail.procurement_allocation_id
       AND allocation.receipt_line_id=detail.procurement_receipt_line_id
     JOIN procurement_order_line assigned_line ON assigned_line.id=allocation.purchase_order_line_id
     WHERE detail.id IN (${detailIds.map(() => '?').join(',')})`,
    detailIds,
  );
  for (const row of rows) supplierIds.set(String(row.inbound_detail_id), String(row.supplier_id));
  return supplierIds;
}
