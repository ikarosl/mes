import { allocationRemaining } from './receipt-allocation.query.js';
import type {
  PageResult,
  ProcurementReceiptQuery,
  ProcurementReceiptItem,
  ProcurementReceiptLineListItem,
  ProcurementInboundReleaseQuery,
  ProcurementInboundReleaseItem,
} from '@company/contracts';
import type { MaterialVariantQuery } from '../../../product/public.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  RECEIPT_COLUMNS,
  RECEIPT_LINE_FROM,
  receiptSelect,
  lineSelect,
  readCurrentRounds,
  LINE_COLUMNS,
  RECEIPT_LIST_SOURCE_COLUMNS,
  RECEIPT_LINE_LIST_ORDER,
  mapReceiptListSource,
  mapReceipt,
  mapRound,
  readReceiptSuppliers,
  pageInput,
  slots,
  text,
  nullableText,
  date,
} from './receipt-read.shared.js';
import { readReceiptQuantitySummaries } from './receipt-quantities.query.js';

const RECEIPT_KEYWORD_LINE_SELECT = `SELECT 1 FROM procurement_receipt_line search_line
  JOIN procurement_order_line search_order_line ON search_order_line.id=search_line.purchase_order_line_id
  JOIN procurement_supplier search_supplier ON search_supplier.id=search_order_line.supplier_id
  JOIN materials search_material ON search_material.id=search_line.item_id
  WHERE search_line.receipt_id=r.id AND (
    search_supplier.supplier_name LIKE ? OR search_material.material_name LIKE ?
    OR search_order_line.item_code_snapshot LIKE ?
    OR search_order_line.material_variant_code_snapshot LIKE ?
  )`;

function filters(
  query: { keyword?: string; supplierId?: string; purchaseOrderId?: string },
  line = false,
) {
  const where = ['1=1'];
  const params: Array<string | number> = [];
  if (query.supplierId) {
    where.push(
      line
        ? 'pol.supplier_id=?'
        : 'EXISTS(SELECT 1 FROM procurement_receipt_line filtered_line JOIN procurement_order_line filtered_order_line ON filtered_order_line.id=filtered_line.purchase_order_line_id WHERE filtered_line.receipt_id=r.id AND filtered_order_line.supplier_id=?)',
    );
    params.push(query.supplierId);
  }
  if (query.purchaseOrderId) {
    where.push('po.id=?');
    params.push(query.purchaseOrderId);
  }
  if (query.keyword?.trim()) {
    if (line)
      where.push(
        '(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR supplier.supplier_name LIKE ? OR material.material_name LIKE ? OR pol.item_code_snapshot LIKE ? OR pol.material_variant_code_snapshot LIKE ?)',
      );
    else
      where.push(
        `(r.receipt_no LIKE ? OR po.purchase_no LIKE ? OR EXISTS(${RECEIPT_KEYWORD_LINE_SELECT}))`,
      );
    params.push(...Array<string>(6).fill(`%${query.keyword.trim()}%`));
  }
  return { where, params };
}
export async function listReceipts(
  db: Db,
  query: ProcurementReceiptQuery,
): Promise<PageResult<ProcurementReceiptItem>> {
  const { where, params } = filters(query);
  if (query.awaitingAcceptance === 'yes')
    where.push(
      'r.is_voided=0',
      "EXISTS(SELECT 1 FROM procurement_receipt_line pending_line JOIN procurement_receipt_round pending_round ON pending_round.id=pending_line.current_round_id WHERE pending_line.receipt_id=r.id AND pending_round.status='awaiting_acceptance')",
    );
  const { page, pageSize } = pageInput(query);
  const [[count]] = await db.query<ReadRow[]>(
    `${receiptSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${receiptSelect(RECEIPT_COLUMNS)}
    WHERE ${where.join(' AND ')} ORDER BY r.received_at DESC,r.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const suppliers = await readReceiptSuppliers(
    db,
    rows.map((row) => text(row.id)),
  );
  return {
    items: rows.map((row) => mapReceipt(row, suppliers.get(text(row.id)) ?? [])),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

export async function listReceiptLines(
  db: Db,
  query: ProcurementReceiptQuery,
): Promise<PageResult<ProcurementReceiptLineListItem>> {
  const { where, params } = filters(query, true);
  if (query.awaitingAcceptance === 'yes')
    where.push(
      'r.is_voided=0',
      "EXISTS(SELECT 1 FROM procurement_receipt_round pending_round WHERE pending_round.id=line.current_round_id AND pending_round.status='awaiting_acceptance')",
    );
  const { page, pageSize } = pageInput(query);
  const [[count]] = await db.query<ReadRow[]>(
    `${lineSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${lineSelect(RECEIPT_LIST_SOURCE_COLUMNS + ',line.id,line.supplier_batch_code,r.received_at')}
    WHERE ${where.join(' AND ')}
    ORDER BY ${RECEIPT_LINE_LIST_ORDER} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const ids = rows.map((row) => text(row.id));
  const currentRounds = await readCurrentRounds(db, ids);
  const quantities = await readReceiptQuantitySummaries(db, ids, currentRounds);
  return {
    items: rows.map((row) => {
      const id = text(row.id);
      const currentRound = currentRounds.get(id);
      const summary = quantities.get(id);
      if (!currentRound || !summary) throw new Error('到货明细缺少当前轮次或数量投影');
      return {
        ...mapReceiptListSource(row),
        id,
        supplierBatchCode: nullableText(row.supplier_batch_code),
        receivedAt: date(row.received_at),
        currentRound: mapRound(currentRound),
        quantities: summary,
      };
    }),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
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
  const selectedFilters = filters(query, true);
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
