import type {
  PageResult,
  ProcurementReceiptQuery,
  ProcurementReceiptItem,
  ProcurementInboundReleaseQuery,
  ProcurementInboundReleaseItem,
  ProcurementInboundInspectionQuery,
  ProcurementInboundInspectionItem,
} from '@company/contracts';
import type { MaterialVariantQuery } from '../../../product/public.js';
import type { QualityInboundQuery } from '../../../quality/public.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  RECEIPT_COLUMNS,
  receiptSelect,
  lineSelect,
  LINE_COLUMNS,
  mapReceipt,
  pageInput,
  slots,
  text,
  nullableText,
} from './receipt-read.shared.js';

function filters(
  query: { keyword?: string; supplierId?: string; purchaseOrderId?: string },
  line = false,
) {
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
      `(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR supplier.supplier_name LIKE ?${line ? ' OR material.material_name LIKE ? OR pol.item_code_snapshot LIKE ? OR pol.material_variant_code_snapshot LIKE ?' : ''})`,
    );
    params.push(...(Array(line ? 6 : 3).fill(`%${query.keyword.trim()}%`) as string[]));
  }
  return { where, params };
}
export async function listReceipts(
  db: Db,
  query: ProcurementReceiptQuery,
): Promise<PageResult<ProcurementReceiptItem>> {
  const { where, params } = filters(query);
  const { page, pageSize } = pageInput(query);
  const [[count]] = await db.query<ReadRow[]>(
    `${receiptSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${receiptSelect(RECEIPT_COLUMNS + ',(SELECT COUNT(*) FROM procurement_receipt_line line WHERE line.receipt_id=r.id) line_count')}
    WHERE ${where.join(' AND ')} ORDER BY r.received_at DESC,r.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapReceipt), total: Number(count?.total ?? 0), page, pageSize };
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
    JOIN procurement_receipt_scope scope ON scope.receipt_line_id=line.id WHERE scope.disposition='approved' AND scope.termination_root_scope_id IS NULL`);
  const eligible = await variants.listPurchasableByMaterials({
    materialIds: materials.map((r) => text(r.item_id)),
  });
  if (!eligible.length) return empty;
  const { where, params } = filters(query, true);
  where.push(
    `scope.disposition='approved'`,
    `scope.termination_root_scope_id IS NULL`,
    `scope.inbound_approved=1`,
    `scope.inspection_disposition='release'`,
    `scope.case_status='completed'`,
    `(batch.id IS NULL OR batch.batch_status='available')`,
    `line.material_variant_id IN (${slots(eligible.map((v) => v.id))})`,
  );
  params.push(...eligible.map((v) => v.id));
  if (query.receiptLineId) {
    where.push('line.id=?');
    params.push(query.receiptLineId);
  }
  if (query.scopeIds) {
    if (!query.scopeIds.length) return empty;
    where.push(`scope.id IN (${slots(query.scopeIds)})`);
    params.push(...query.scopeIds);
  }
  const releases = `SELECT scope.id,scope.receipt_line_id,scope.version,scope.receipt_revision_id,scope.inspection_id,scope.quantity,scope.disposition,scope.termination_root_scope_id,
    inspection.inbound_approved,inspection.disposition inspection_disposition,qc.status case_status
    FROM procurement_receipt_scope scope JOIN quality_inbound_inspection inspection ON inspection.id=scope.inspection_id
      AND inspection.receipt_line_id=scope.receipt_line_id AND inspection.receipt_revision_id=scope.receipt_revision_id
    JOIN quality_inbound_case qc ON qc.id=inspection.case_id`;
  const select = (columns: string) =>
    `${lineSelect(columns)} JOIN (${releases}) scope ON scope.receipt_line_id=line.id`;
  const [[count]] = await db.query<ReadRow[]>(
    `${select('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${select(LINE_COLUMNS + ',scope.id scope_id,scope.version scope_version,scope.receipt_revision_id,scope.inspection_id,scope.quantity')}
    WHERE ${where.join(' AND ')} ORDER BY r.received_at,line.id,scope.id LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => ({
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      receiptLineId: text(row.id),
      receiptLineVersion: Number(row.version),
      purchaseOrderId: text(row.purchase_order_id),
      purchaseNo: text(row.purchase_no),
      supplierId: text(row.supplier_id),
      supplierName: text(row.supplier_name),
      itemId: text(row.item_id),
      itemCode: text(row.item_code_snapshot),
      itemName: text(row.material_name),
      materialVariantId: text(row.material_variant_id),
      materialVariantCode: text(row.material_variant_code_snapshot),
      unit: text(row.unit_snapshot),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      batchId: nullableText(row.batch_id),
      batchCode: nullableText(row.batch_code),
      scopeId: text(row.scope_id),
      scopeVersion: Number(row.scope_version),
      receiptRevisionId: text(row.receipt_revision_id),
      inspectionId: text(row.inspection_id),
      approvedRemainingQuantity: text(row.quantity),
    })),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

const TASKS = `(SELECT 'uninspected' task_kind,scope.id task_id,scope.receipt_line_id,scope.id scope_id,scope.version scope_version,scope.quantity covered_quantity,
    NULL case_id,'uninspected' task_status,NULL case_type,scope.created_at FROM procurement_receipt_scope scope WHERE scope.disposition='uninspected'
  UNION ALL SELECT 'case',qc.id,qc.receipt_line_id,qc.target_scope_id,scope.version,qc.covered_quantity,qc.id,qc.status,qc.case_type,qc.created_at
    FROM quality_inbound_case qc LEFT JOIN procurement_receipt_scope scope ON scope.id=qc.target_scope_id) task`;
export async function listInspections(
  db: Db,
  quality: QualityInboundQuery,
  query: ProcurementInboundInspectionQuery,
  caseId?: string,
): Promise<PageResult<ProcurementInboundInspectionItem>> {
  const { page, pageSize } = pageInput(query);
  const { where, params } = filters(query, true);
  if (query.status) {
    where.push('task.task_status=?');
    params.push(query.status);
  }
  if (query.caseType) {
    where.push('task.case_type=?');
    params.push(query.caseType);
  }
  if (query.receiptLineIds) {
    if (!query.receiptLineIds.length) return { items: [], total: 0, page, pageSize };
    where.push(`line.id IN (${slots(query.receiptLineIds)})`);
    params.push(...query.receiptLineIds);
  }
  if (caseId) {
    where.push('task.case_id=?');
    params.push(caseId);
  }
  const select = (columns: string) =>
    `${lineSelect(columns)} JOIN ${TASKS} ON task.receipt_line_id=line.id`;
  const [[count]] = await db.query<ReadRow[]>(
    `${select('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${select(LINE_COLUMNS + ',task.task_kind,task.task_id,task.scope_id,task.scope_version,task.covered_quantity,task.case_id')}
    WHERE ${where.join(' AND ')} ORDER BY task.created_at DESC,task.task_kind,task.task_id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const cases = await quality.getCases(
    rows.filter((r) => r.case_id !== null).map((r) => text(r.case_id)),
  );
  const casesById = new Map(cases.map((item) => [item.id, item]));
  return {
    items: rows.map((row) => ({
      taskKey: `${row.task_kind}:${row.task_id}`,
      taskKind: row.task_kind as 'uninspected' | 'case',
      case: row.case_id === null ? null : (casesById.get(text(row.case_id)) ?? null),
      receiptLineId: text(row.id),
      receiptLineVersion: Number(row.version),
      scopeId: nullableText(row.scope_id),
      scopeVersion: row.scope_version === null ? null : Number(row.scope_version),
      coveredQuantity: text(row.covered_quantity),
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      purchaseOrderId: text(row.purchase_order_id),
      purchaseNo: text(row.purchase_no),
      supplierName: text(row.supplier_name),
      itemCode: text(row.item_code_snapshot),
      itemName: text(row.material_name),
      materialVariantCode: text(row.material_variant_code_snapshot),
      unit: text(row.unit_snapshot),
    })),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
