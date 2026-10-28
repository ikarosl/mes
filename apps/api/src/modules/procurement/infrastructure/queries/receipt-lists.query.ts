import { allocationRemaining } from './receipt-allocation.query.js';
import type {
  PageResult,
  ProcurementInboundReleaseQuery,
  ProcurementInboundReleaseItem,
} from '@company/contracts';
import type { MaterialVariantQuery } from '../../../product/public.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  RECEIPT_LINE_FROM,
  LINE_COLUMNS,
  pageInput,
  slots,
  text,
  nullableText,
  date,
} from './receipt-read.shared.js';

function filters(query: { keyword?: string; supplierId?: string; purchaseOrderId?: string }) {
  const where = ['1=1'];
  const params: Array<string | number> = [];
  if (query.supplierId) {
    where.push('po.supplier_id=?');
    params.push(query.supplierId);
  }
  if (query.purchaseOrderId) {
    where.push('po.id=?');
    params.push(query.purchaseOrderId);
  }
  if (query.keyword?.trim()) {
    where.push(
      '(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR supplier.supplier_name LIKE ? OR material.material_name LIKE ? OR pol.item_code_snapshot LIKE ? OR pol.material_variant_code_snapshot LIKE ?)',
    );
    params.push(...Array<string>(6).fill(`%${query.keyword.trim()}%`));
  }
  return { where, params };
}
export async function listInboundReleases(
  db: Db,
  variants: MaterialVariantQuery,
  query: ProcurementInboundReleaseQuery,
): Promise<PageResult<ProcurementInboundReleaseItem>> {
  const { page, pageSize } = pageInput(query);
  const empty = { items: [], total: 0, page, pageSize };
  const [materials] = await db.query<
    ReadRow[]
  >(`SELECT DISTINCT line.item_id FROM procurement_receipt_line line
    JOIN procurement_receipt receipt ON receipt.id=line.receipt_id
    JOIN procurement_receipt_allocation allocation ON allocation.receipt_line_id=line.id AND allocation.round_id=line.current_round_id JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id WHERE current_round.status='finalized' AND allocation.disposition='inbound' AND allocation.termination_reason IS NULL
      AND receipt.is_voided=0`);
  const eligible = await variants.listPurchasableByMaterials({
    materialIds: materials.map((r) => text(r.item_id)),
  });
  if (!eligible.length) return empty;
  const selectedFilters = filters(query);
  const where = selectedFilters.where;
  const params = selectedFilters.params;
  where.push(
    `r.is_voided=0`,
    `allocation.disposition='inbound'`,
    `allocation.termination_reason IS NULL`,
    `inspection.release_decision='released'`,
    `current_round.status='finalized'`,
    `allocation.round_id=current_round.id`,
    `current_round.inspection_id=inspection.id`,
    `acceptance.round_id=current_round.id`,
    `qc.status='completed'`,
    `(${allocationRemaining('allocation.id', 'allocation.quantity')})>0`,
    `line.material_variant_id IN (${slots(eligible.map((v) => v.id))})`,
  );
  params.push(...eligible.map((v) => v.id));
  if (query.receiptLineId) {
    where.push('line.id=?');
    params.push(query.receiptLineId);
  }
  if (query.allocationIds) {
    if (!query.allocationIds.length) return empty;
    where.push(`allocation.id IN (${slots(query.allocationIds)})`);
    params.push(...query.allocationIds);
  }
  const select = (columns: string) => `SELECT ${columns} ${RECEIPT_LINE_FROM}
    JOIN materials material ON material.id=line.item_id
    JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id
    JOIN procurement_receipt_allocation allocation ON allocation.receipt_line_id=line.id AND allocation.round_id=current_round.id
    JOIN procurement_receipt_acceptance acceptance ON acceptance.id=allocation.acceptance_id
    JOIN quality_inspection_record inspection ON inspection.id=acceptance.inspection_record_id AND inspection.receipt_line_id=line.id
    JOIN quality_inspection_case qc ON qc.id=inspection.case_id`;
  const [[count]] = await db.query<ReadRow[]>(
    `${select('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${select(LINE_COLUMNS + ',r.received_at,current_round.id round_id,current_round.version round_version,acceptance.id acceptance_id,allocation.id allocation_id,acceptance.after_receipt_revision_id receipt_revision_id,inspection.id inspection_id,qc.id inspection_case_id,' + allocationRemaining('allocation.id', 'allocation.quantity') + ' quantity')}
    WHERE ${where.join(' AND ')} ORDER BY r.received_at,line.id,allocation.id LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => ({
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      receiptLineId: text(row.id),
      receiptLineVersion: Number(row.version),
      receiptReceivedAt: date(row.received_at),
      receiptPurchaseNo: text(row.purchase_no),
      roundId: text(row.round_id),
      roundVersion: Number(row.round_version),
      purchaseOrderId: text(row.purchase_order_id),
      purchaseNo: text(row.purchase_no),
      purchaseOrderLineId: text(row.purchase_order_line_id),
      acceptanceId: text(row.acceptance_id),
      allocationId: text(row.allocation_id),
      supplierId: text(row.supplier_id),
      supplierName: text(row.supplier_name),
      itemId: text(row.item_id),
      itemCode: text(row.item_code_snapshot),
      itemName: text(row.material_name),
      materialVariantId: text(row.material_variant_id),
      materialVariantCode: text(row.material_variant_code_snapshot),
      unit: text(row.unit_snapshot),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      receiptRevisionId: text(row.receipt_revision_id),
      inspectionId: text(row.inspection_id),
      inspectionCaseId: text(row.inspection_case_id),
      approvedRemainingQuantity: text(row.quantity),
    })),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
