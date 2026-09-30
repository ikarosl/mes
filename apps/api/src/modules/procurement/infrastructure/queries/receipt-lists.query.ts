import { allocationRemaining } from './receipt-allocation.query.js';
import type {
  PageResult,
  ProcurementReceiptQuery,
  ProcurementReceiptItem,
  ProcurementReceiptLineListItem,
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
  readCurrentRounds,
  LINE_COLUMNS,
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
      "EXISTS(SELECT 1 FROM procurement_receipt_line pending_line JOIN procurement_receipt_round pending_round ON pending_round.id=pending_line.current_round_id WHERE pending_line.receipt_id=r.id AND pending_round.status='awaiting_acceptance')",
    );
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
      "EXISTS(SELECT 1 FROM procurement_receipt_round pending_round WHERE pending_round.id=line.current_round_id AND pending_round.status='awaiting_acceptance')",
    );
  const { page, pageSize } = pageInput(query);
  const [[count]] = await db.query<ReadRow[]>(
    `${lineSelect('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${lineSelect(LINE_COLUMNS + ',r.received_at')}
    WHERE ${where.join(' AND ')}
    ORDER BY r.received_at DESC,r.id DESC,line.line_no ASC,line.id ASC LIMIT ? OFFSET ?`,
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
        id,
        receiptId: text(row.receipt_id),
        receiptNo: text(row.receipt_no),
        purchaseOrderId: text(row.purchase_order_id),
        purchaseNo: text(row.purchase_no),
        purchaseOrderLineId: text(row.purchase_order_line_id),
        purchaseOrderLineNo: Number(row.purchase_order_line_no),
        lineNo: Number(row.line_no),
        itemId: text(row.item_id),
        itemCode: text(row.item_code_snapshot),
        itemName: text(row.material_name),
        materialVariantId: text(row.material_variant_id),
        materialVariantCode: text(row.material_variant_code_snapshot),
        unit: text(row.unit_snapshot),
        supplierId: text(row.supplier_id),
        supplierName: text(row.supplier_name),
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
    JOIN procurement_receipt_allocation allocation ON allocation.receipt_line_id=line.id AND allocation.round_id=line.current_round_id JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id WHERE current_round.status='finalized' AND allocation.disposition='inbound' AND allocation.termination_reason IS NULL`);
  const eligible = await variants.listPurchasableByMaterials({
    materialIds: materials.map((r) => text(r.item_id)),
  });
  if (!eligible.length) return empty;
  const selectedFilters = filters(query, true);
  const where = selectedFilters.where.map((clause) => clause.replaceAll('po.', 'assigned_order.'));
  const params = selectedFilters.params;
  where.push(
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
  const select = (columns: string) => `SELECT ${columns} FROM procurement_receipt_line line
    JOIN procurement_receipt r ON r.id=line.receipt_id
    JOIN procurement_order po ON po.id=line.purchase_order_id
    JOIN procurement_order_line pol ON pol.id=line.purchase_order_line_id
    JOIN procurement_supplier supplier ON supplier.id=pol.supplier_id
    JOIN materials material ON material.id=line.item_id
    JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id
    JOIN procurement_receipt_allocation allocation ON allocation.receipt_line_id=line.id AND allocation.round_id=current_round.id
    JOIN procurement_receipt_acceptance acceptance ON acceptance.id=allocation.acceptance_id
    JOIN quality_inspection_record inspection ON inspection.id=acceptance.inspection_record_id AND inspection.receipt_line_id=line.id
    JOIN quality_inspection_case qc ON qc.id=inspection.case_id
    JOIN procurement_order_line assigned_line ON assigned_line.id=allocation.purchase_order_line_id
    JOIN procurement_order assigned_order ON assigned_order.id=assigned_line.purchase_order_id`;
  const [[count]] = await db.query<ReadRow[]>(
    `${select('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${select(LINE_COLUMNS + ',r.received_at,current_round.id round_id,current_round.version round_version,acceptance.id acceptance_id,allocation.id allocation_id,assigned_line.id assigned_line_id,assigned_order.id assigned_order_id,assigned_order.purchase_no assigned_purchase_no,acceptance.after_receipt_revision_id receipt_revision_id,inspection.id inspection_id,qc.id inspection_case_id,' + allocationRemaining('allocation.id', 'allocation.quantity') + ' quantity')}
    WHERE ${where.join(' AND ')} ORDER BY r.received_at,line.id,allocation.id LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => ({
      receiptId: text(row.receipt_id),
      receiptNo: text(row.receipt_no),
      receiptLineId: text(row.id),
      receiptLineNo: Number(row.line_no),
      receiptLineVersion: Number(row.version),
      receiptReceivedAt: date(row.received_at),
      receiptPurchaseNo: text(row.purchase_no),
      roundId: text(row.round_id),
      roundVersion: Number(row.round_version),
      purchaseOrderId: text(row.assigned_order_id),
      purchaseNo: text(row.assigned_purchase_no),
      purchaseOrderLineId: text(row.assigned_line_id),
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

const TASKS = `(SELECT 'uninspected' task_kind,round.id task_id,round.receipt_line_id,
    round.id round_id,round.round_no source_round_no,round.version round_version,round.status round_status,round.starting_quantity declared_quantity,
    NULL case_id,'uninspected' task_status,NULL case_type,round.created_at
    FROM procurement_receipt_round round JOIN procurement_receipt_line current_line ON current_line.current_round_id=round.id
    WHERE round.status='uninspected'
  UNION ALL SELECT 'case',qc.id,qc.receipt_line_id,round.id,round.round_no,round.version,IF(round.id=current_line.current_round_id,round.status,'superseded'),qc.declared_quantity,
    qc.id,qc.status,qc.case_type,qc.created_at
    FROM quality_inspection_case qc JOIN procurement_receipt_round round ON round.id=qc.incoming_round_id
    JOIN procurement_receipt_line current_line ON current_line.id=round.receipt_line_id
    WHERE qc.source_kind='incoming') task`;
const ADOPTED_CASE_SELECT = `SELECT 1 FROM quality_inspection_record adopted_record
  WHERE adopted_record.id=current_round.inspection_id
    AND adopted_record.receipt_line_id=line.id
    AND adopted_record.case_id=task.case_id`;
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
  if (query.roundStatus) {
    where.push('task.round_status=?');
    params.push(query.roundStatus);
  }
  if (query.currentRoundStatus) {
    where.push('current_round.status=?');
    params.push(query.currentRoundStatus);
    where.push(`(task.round_id=current_round.id OR EXISTS(${ADOPTED_CASE_SELECT}))`);
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
    `${lineSelect(columns)} JOIN ${TASKS} ON task.receipt_line_id=line.id
    JOIN procurement_receipt_round current_round ON current_round.id=line.current_round_id`;
  const [[count]] = await db.query<ReadRow[]>(
    `${select('COUNT(*) total')} WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<ReadRow[]>(
    `${select(LINE_COLUMNS + ',task.task_kind,task.task_id,task.round_id,task.source_round_no,task.round_version,task.round_status,task.declared_quantity,task.case_id,current_round.id active_round_id,current_round.round_no active_round_no,current_round.status active_round_status,current_round.inspection_id active_inspection_id')}
    WHERE ${where.join(' AND ')} ORDER BY task.created_at DESC,task.task_kind,task.task_id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const cases = await quality.getCases(
    rows.filter((r) => r.case_id !== null).map((r) => text(r.case_id)),
  );
  const casesById = new Map(cases.map((item) => [item.id, item]));
  return {
    items: rows.map((row) => {
      const inspectionCase =
        row.case_id === null ? null : (casesById.get(text(row.case_id)) ?? null);
      const currentInspectionId = nullableText(row.active_inspection_id);
      const roundId = text(row.round_id);
      const isCurrentlyAdopted =
        currentInspectionId !== null && inspectionCase?.inspection?.id === currentInspectionId;
      return {
        taskKey: `${row.task_kind}:${row.task_id}`,
        taskKind: row.task_kind as 'uninspected' | 'case',
        case: inspectionCase,
        receiptLineId: text(row.id),
        receiptLineNo: Number(row.line_no),
        receiptLineVersion: Number(row.version),
        roundId,
        roundVersion: Number(row.round_version),
        roundStatus: row.round_status as ProcurementInboundInspectionItem['roundStatus'],
        sourceRoundNo: Number(row.source_round_no),
        currentRound: {
          id: text(row.active_round_id),
          roundNo: Number(row.active_round_no),
          status:
            row.active_round_status as ProcurementInboundInspectionItem['currentRound']['status'],
          inspectionId: currentInspectionId,
        },
        isCurrentlyAdopted,
        isInherited: isCurrentlyAdopted && roundId !== text(row.active_round_id),
        coveredQuantity: text(row.declared_quantity),
        receiptId: text(row.receipt_id),
        receiptNo: text(row.receipt_no),
        purchaseOrderId: text(row.purchase_order_id),
        purchaseNo: text(row.purchase_no),
        supplierId: text(row.supplier_id),
        supplierName: text(row.supplier_name),
        itemCode: text(row.item_code_snapshot),
        itemName: text(row.material_name),
        materialVariantCode: text(row.material_variant_code_snapshot),
        unit: text(row.unit_snapshot),
      };
    }),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
