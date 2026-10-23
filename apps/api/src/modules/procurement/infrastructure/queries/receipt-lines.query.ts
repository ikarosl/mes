import type {
  ProcurementReceiptAcceptanceContext,
  ProcurementReceiptItem,
  ProcurementReceiptLine,
  ProcurementReceiptLineIndexItem,
  ProcurementReceiptLineOverview,
  QualityInboundCaseItem,
  ReceiptQuantitySummary,
  ReceiptRoundItem,
} from '@company/contracts';
import type { QualityInboundQuery } from '../../../quality/public.js';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import { readCurrentAllocationRows } from './receipt-allocation.query.js';
import { readPurchaseLineMetrics } from './purchase-order-metrics.query.js';
import {
  readReceiptInspectionExecution,
  readReceiptPhysicalQuantities,
  readReceiptQuantitySummaries,
} from './receipt-quantities.query.js';
import {
  type ReadRow,
  LINE_COLUMNS,
  RECEIPT_COLUMNS,
  RECEIPT_VOID_COLUMNS,
  lineSelect,
  receiptSelect,
  readCurrentRounds,
  readReceiptSuppliers,
  text,
  nullableText,
  mapReceipt,
  mapReceiptVoid,
  mapRound,
  mapAllocation,
} from './receipt-read.shared.js';

export async function readReceipt(db: Db, id: string): Promise<ProcurementReceiptItem> {
  const [[row]] = await db.query<ReadRow[]>(
    `${receiptSelect(RECEIPT_COLUMNS + ',(SELECT COUNT(*) FROM procurement_receipt_line line WHERE line.receipt_id=r.id) line_count')} WHERE r.id=?`,
    [id],
  );
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货单不存在');
  return mapReceipt(row, (await readReceiptSuppliers(db, [id])).get(id) ?? []);
}

/** 整单目录只需要当前轮摘要和真实剩余，不读取授权、采购指标或历史。 */
export async function readReceiptLineIndex(
  db: Db,
  receiptId: string,
): Promise<ProcurementReceiptLineIndexItem[]> {
  const [rows] = await db.query<ReadRow[]>(
    `${lineSelect(`line.id,pol.item_code_snapshot,material.material_name,pol.material_variant_code_snapshot,
      supplier.supplier_name,line.supplier_batch_code,${RECEIPT_VOID_COLUMNS}`)}
      WHERE line.receipt_id=? ORDER BY line.line_no,line.id`,
    [receiptId],
  );
  const ids = rows.map((row) => text(row.id));
  const currentRounds = await readCurrentRounds(db, ids);
  const quantities = await readReceiptPhysicalQuantities(db, ids);
  return rows.map((row) => {
    const id = text(row.id);
    const currentRound = currentRounds.get(id);
    const summary = quantities.get(id);
    if (!currentRound || !summary) throw new Error('到货明细缺少当前轮次或数量投影');
    return {
      id,
      itemCode: text(row.item_code_snapshot),
      itemName: text(row.material_name),
      materialVariantCode: text(row.material_variant_code_snapshot),
      supplierName: text(row.supplier_name),
      supplierBatchCode: nullableText(row.supplier_batch_code),
      void: mapReceiptVoid(row),
      currentRound: {
        status: currentRound.status as ReceiptRoundItem['status'],
        triggerType: currentRound.trigger_type as ReceiptRoundItem['triggerType'],
      },
      quantities: { unprocessedQuantity: summary.unprocessedQuantity },
    };
  });
}

async function readReceiptLineSources(
  db: Db,
  filter: { receiptId: string } | { lineId: string },
  includePurchaseReference = false,
): Promise<ReadRow[]> {
  const [rows] = await db.query<ReadRow[]>(
    `${lineSelect(
      LINE_COLUMNS +
        ',registered_revision.received_quantity registered_quantity' +
        (includePurchaseReference ? ',pol.planned_quantity original_planned_quantity' : ''),
    )}
      JOIN procurement_receipt_revision registered_revision
        ON registered_revision.id=line.current_receipt_revision_id AND registered_revision.receipt_line_id=line.id
      WHERE ${'receiptId' in filter ? 'line.receipt_id' : 'line.id'}=? ORDER BY line.line_no,line.id`,
    ['receiptId' in filter ? filter.receiptId : filter.lineId],
  );
  return rows;
}

function mapReceiptLineOverview(
  row: ReadRow,
  currentRound: ReadRow,
  quantities: ReceiptQuantitySummary,
): ProcurementReceiptLineOverview {
  return {
    void: mapReceiptVoid(row),
    id: text(row.id),
    receiptId: text(row.receipt_id),
    receiptNo: text(row.receipt_no),
    purchaseOrderId: text(row.purchase_order_id),
    purchaseNo: text(row.purchase_no),
    purchaseOrderLineId: text(row.purchase_order_line_id),
    purchaseOrderLineNo: Number(row.purchase_order_line_no),
    supplierId: text(row.supplier_id),
    supplierName: text(row.supplier_name),
    itemId: text(row.item_id),
    itemCode: text(row.item_code_snapshot),
    itemName: text(row.material_name),
    materialVariantId: text(row.material_variant_id),
    materialVariantCode: text(row.material_variant_code_snapshot),
    unit: text(row.unit_snapshot),
    supplierBatchCode: nullableText(row.supplier_batch_code),
    currentRound: mapRound(currentRound),
    currentReceiptRevisionId: text(row.current_receipt_revision_id),
    registeredQuantity: text(row.registered_quantity),
    overReceiptNote: nullableText(row.over_receipt_note),
    version: Number(row.version),
    quantities,
  };
}

/** 作废核对需要完整行集合及版本，但不需要分配明细、采购指标或检验。 */
export async function readReceiptLineOverviews(
  db: Db,
  receiptId: string,
): Promise<ProcurementReceiptLineOverview[]> {
  const rows = await readReceiptLineSources(db, { receiptId });
  const ids = rows.map((row) => text(row.id));
  const currentRounds = await readCurrentRounds(db, ids);
  const summaries = await readReceiptQuantitySummaries(db, ids, currentRounds);
  return rows.map((row) => {
    const id = text(row.id);
    const currentRound = currentRounds.get(id);
    const quantities = summaries.get(id);
    if (!currentRound || !quantities) throw new Error('到货明细缺少当前轮次或数量投影');
    return mapReceiptLineOverview(row, currentRound, quantities);
  });
}

async function readCurrentReceiptLine(
  db: Db,
  id: string,
): Promise<{ line: ProcurementReceiptLine; originalRemainingPlannedQuantity: string }> {
  const [row] = await readReceiptLineSources(db, { lineId: id }, true);
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货明细不存在');
  const currentRounds = await readCurrentRounds(db, [id]);
  const currentRound = currentRounds.get(id);
  if (!currentRound) throw new Error('到货明细缺少当前处理轮次');
  const allocations = await readCurrentAllocationRows(db, [id]);
  const quantities = (await readReceiptQuantitySummaries(db, [id], currentRounds, allocations)).get(
    id,
  );
  if (!quantities) throw new Error('到货明细缺少数量投影');
  const purchaseOrderLineId = text(row.purchase_order_line_id);
  const purchaseLineMetrics = (await readPurchaseLineMetrics(db, [purchaseOrderLineId])).get(
    purchaseOrderLineId,
  );
  if (!purchaseLineMetrics) throw new Error('到货明细缺少来源采购行数量投影');
  return {
    line: {
      ...mapReceiptLineOverview(row, currentRound, quantities),
      purchaseLineQuantities: {
        plannedQuantity: text(row.original_planned_quantity),
        receivedQuantity: purchaseLineMetrics.quantities.receivedQuantity,
      },
      allocations: allocations.map(mapAllocation),
    },
    originalRemainingPlannedQuantity: String(
      Math.max(
        0,
        Number(row.original_planned_quantity) -
          Number(purchaseLineMetrics.quantities.approvedQuantity),
      ),
    ),
  };
}

export async function readReceiptLine(db: Db, id: string): Promise<ProcurementReceiptLine> {
  return (await readCurrentReceiptLine(db, id)).line;
}

export async function readReceiptAcceptanceContext(
  db: Db,
  quality: QualityInboundQuery,
  id: string,
): Promise<ProcurementReceiptAcceptanceContext> {
  const { line, originalRemainingPlannedQuantity } = await readCurrentReceiptLine(db, id);
  const inspectionId = line.currentRound.inspectionId;
  let currentInspectionCase: QualityInboundCaseItem | null = null;
  let inspectionSourceRoundNo: number | null = null;
  if (inspectionId !== null) {
    const [[reference]] = await db.query<ReadRow[]>(
      `SELECT q.id,source.round_no FROM quality_inspection_record record
        JOIN quality_inspection_case q ON q.id=record.case_id AND q.receipt_line_id=record.receipt_line_id
          AND q.source_kind='incoming'
        JOIN procurement_receipt_round source ON source.id=q.incoming_round_id AND source.receipt_line_id=q.receipt_line_id
        WHERE record.id=? AND record.receipt_line_id=?`,
      [inspectionId, id],
    );
    if (!reference) throw new Error('到货明细缺少当前采用的检验依据');
    // getCases 复用外层只读事务；单个 getCase 的锁读不适用于组合详情快照。
    const [inspectionCase] = await quality.getCases([text(reference.id)]);
    if (!inspectionCase || inspectionCase.inspection?.id !== inspectionId)
      throw new Error('到货明细缺少当前采用的检验依据');
    currentInspectionCase = inspectionCase;
    inspectionSourceRoundNo = Number(reference.round_no);
  }
  return {
    ...line,
    currentInspectionCase,
    inspectionSourceRoundNo,
    currentInspectionExecution: await readReceiptInspectionExecution(db, id, inspectionId),
    originalRemainingPlannedQuantity,
  };
}
