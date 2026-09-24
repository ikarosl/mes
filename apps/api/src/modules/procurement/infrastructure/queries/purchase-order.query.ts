import type { RowDataPacket } from 'mysql2/promise';
import type {
  PurchaseOrderQuery,
  ProcurementSupplierSummary,
  PurchaseOrderItem,
  PurchaseOrderLine,
  PurchaseOrderDetail,
  PageResult,
  PurchaseOrderLineSource,
  RelatedPurchasesQuery,
  RelatedPurchasesResult,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { allowedPurchaseOrderClosureReasons } from '../../domain/purchase-order-closure.policy.js';
import { readPurchaseLineMetrics } from './purchase-order-metrics.query.js';
import {
  type Db,
  type OrderRow,
  type OrderLineRow,
  type ClosureRow,
  mapOrder,
  mapClosure,
  idsSql,
  orderError,
  readSourceIds,
} from '../mysql-purchase-order.shared.js';

type OrderDisplayRow = OrderRow & { work_order_no: string | null; line_count: number };
const ORDER_DISPLAY_SELECT = `SELECT o.id,o.purchase_no,o.work_order_id,o.source_type,o.supplement_reason,o.status,o.remark,o.version,o.ordered_at,o.created_at,o.updated_at,w.work_order_no,(SELECT COUNT(*) FROM procurement_order_line l WHERE l.purchase_order_id=o.id) line_count FROM procurement_order o LEFT JOIN work_orders w ON w.id=o.work_order_id`;
export const readOrderSuppliers = async (
  db: Db,
  ids: string[],
): Promise<Map<string, ProcurementSupplierSummary[]>> => {
  const result = new Map<string, ProcurementSupplierSummary[]>();
  if (!ids.length) return result;
  const [rows] = await db.query<
    (RowDataPacket & { purchase_order_id: number; supplier_id: number; supplier_name: string })[]
  >(
    `SELECT DISTINCT l.purchase_order_id,l.supplier_id,s.supplier_name FROM procurement_order_line l JOIN procurement_supplier s ON s.id=l.supplier_id WHERE l.purchase_order_id IN (${idsSql(ids)}) ORDER BY l.purchase_order_id,l.supplier_id`,
    ids,
  );
  for (const row of rows) {
    const id = String(row.purchase_order_id);
    result.set(id, [
      ...(result.get(id) ?? []),
      { id: String(row.supplier_id), supplierName: row.supplier_name },
    ]);
  }
  return result;
};
const LINE_COLUMNS =
  'l.id,l.purchase_order_id,l.supplier_id,l.line_no,l.item_id,l.material_variant_id,l.item_code_snapshot,l.material_variant_code_snapshot,l.unit_snapshot,l.planned_quantity,l.status,l.version,l.origin_order_line_id,l.origin_receipt_line_id,l.origin_allocation_id,l.supplement_evidence,l.fulfillment_mode';

export const listPurchaseOrders = async (
  db: Db,
  query: PurchaseOrderQuery & { page: number; pageSize: number; onlyNewArrival?: boolean },
): Promise<PageResult<PurchaseOrderItem>> => {
  const where = ['1=1'];
  if (query.onlyNewArrival)
    where.push(
      "EXISTS(SELECT 1 FROM procurement_order_line receivable WHERE receivable.purchase_order_id=o.id AND receivable.status='open' AND receivable.fulfillment_mode='new_arrival')",
    );
  const params: Array<string | number> = [];
  if (query.keyword) {
    where.push(
      '(o.purchase_no LIKE ? OR EXISTS(SELECT 1 FROM procurement_order_line search_line JOIN procurement_supplier search_supplier ON search_supplier.id=search_line.supplier_id WHERE search_line.purchase_order_id=o.id AND search_supplier.supplier_name LIKE ?))',
    );
    params.push(`%${query.keyword}%`, `%${query.keyword}%`);
  }
  if (query.supplierId) {
    where.push(
      'EXISTS(SELECT 1 FROM procurement_order_line filter_line WHERE filter_line.purchase_order_id=o.id AND filter_line.supplier_id=?)',
    );
    params.push(query.supplierId);
  }
  if (query.status) {
    where.push('o.status=?');
    params.push(query.status);
  }
  if (query.sourceType) {
    where.push('o.source_type=?');
    params.push(query.sourceType);
  }
  if (query.originOrderLineId) {
    where.push(
      'EXISTS(SELECT 1 FROM procurement_order_line origin_link WHERE origin_link.purchase_order_id=o.id AND origin_link.origin_order_line_id=?)',
    );
    params.push(query.originOrderLineId);
  }
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM procurement_order o WHERE ${where.join(' AND ')}`,
    params,
  );
  const [rows] = await db.query<OrderDisplayRow[]>(
    `${ORDER_DISPLAY_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const suppliers = await readOrderSuppliers(
    db,
    rows.map((row) => String(row.id)),
  );
  return {
    items: rows.map((row) => mapOrder(row, suppliers.get(String(row.id)) ?? [])),
    total: Number(count?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
};

export const getPurchaseOrder = async (db: Db, id: string): Promise<PurchaseOrderDetail> => {
  const [[order]] = await db.query<OrderDisplayRow[]>(`${ORDER_DISPLAY_SELECT} WHERE o.id=?`, [id]);
  if (!order) return orderError('采购单不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
  const [lines] = await db.query<
    (OrderLineRow & {
      material_name: string;
      supplier_name: string;
      origin_order_id: number | null;
      origin_purchase_no: string | null;
    })[]
  >(
    `SELECT ${LINE_COLUMNS},m.material_name,s.supplier_name,origin.purchase_order_id origin_order_id,original.purchase_no origin_purchase_no
     FROM procurement_order_line l JOIN materials m ON m.id=l.item_id
     JOIN procurement_supplier s ON s.id=l.supplier_id
     LEFT JOIN procurement_order_line origin ON origin.id=l.origin_order_line_id
     LEFT JOIN procurement_order original ON original.id=origin.purchase_order_id
     WHERE l.purchase_order_id=? ORDER BY l.line_no,l.id`,
    [id],
  );
  const sources = await readSources(db, id);
  const metrics = await readPurchaseLineMetrics(
    db,
    lines.map((row) => String(row.id)),
  );
  const [closures] = await db.query<ClosureRow[]>(
    `SELECT c.id,c.purchase_order_line_id,c.reason_type,c.reason,c.planned_quantity,c.received_quantity,c.undetermined_quantity,c.approved_quantity,c.inbound_quantity,c.return_due_quantity,c.returned_quantity,c.quality_returned_quantity,c.created_at FROM procurement_order_line_closure c JOIN procurement_order_line l ON l.id=c.purchase_order_line_id WHERE l.purchase_order_id=?`,
    [id],
  );
  const closureMap = new Map(
    closures.map((row) => [String(row.purchase_order_line_id), mapClosure(row)]),
  );
  return {
    ...mapOrder(order, (await readOrderSuppliers(db, [id])).get(id) ?? []),
    items: lines.map((row) => ({
      id: String(row.id),
      lineNo: row.line_no,
      supplierId: String(row.supplier_id),
      supplierName: row.supplier_name,
      itemId: String(row.item_id),
      itemCode: row.item_code_snapshot,
      itemName: row.material_name,
      materialVariantId: String(row.material_variant_id),
      materialVariantCode: row.material_variant_code_snapshot,
      unit: row.unit_snapshot,
      plannedQuantity: String(row.planned_quantity),
      status: row.status,
      version: row.version,
      sources: sources.get(String(row.id)) ?? [],
      originOrderLineId:
        row.origin_order_line_id === null ? null : String(row.origin_order_line_id),
      originPurchaseOrderId: row.origin_order_id === null ? null : String(row.origin_order_id),
      originPurchaseNo: row.origin_purchase_no,
      supplementEvidence: row.supplement_evidence,
      fulfillmentMode: row.fulfillment_mode as PurchaseOrderLine['fulfillmentMode'],
      originReceiptLineId:
        row.origin_receipt_line_id === null ? null : String(row.origin_receipt_line_id),
      originAllocationId:
        row.origin_allocation_id === null ? null : String(row.origin_allocation_id),
      quantities: metrics.get(String(row.id))!.quantities,
      allowedCloseReasons:
        row.status === 'open'
          ? allowedPurchaseOrderClosureReasons(
              Number(row.planned_quantity),
              metrics.get(String(row.id))!.quantities,
              metrics.get(String(row.id))!.hasReceipt,
            )
          : [],
      closure: closureMap.get(String(row.id)) ?? null,
    })),
  };
};

const readSources = async (
  db: Db,
  orderId: string,
): Promise<Map<string, PurchaseOrderLineSource[]>> => {
  const [rows] = await db.query<
    (RowDataPacket & {
      line_id: number;
      demand_id: number;
      work_order_id: number;
      work_order_no: string;
      production_batch_id: number;
      batch_no: string;
      need_number: string | number;
      remaining_number: string | number;
      supplier_hint: string | null;
    })[]
  >(
    `SELECT l.id line_id,d.id demand_id,b.work_order_id,w.work_order_no,d.production_batch_id,b.batch_no,d.need_number,d.remaining_number,COALESCE(basis.supplier_hint,d.supplier_hint) supplier_hint
     FROM procurement_order_line l JOIN procurement_order_line_source s ON s.purchase_order_line_id=l.id
     JOIN production_item_demand d ON d.id=s.demand_id
     LEFT JOIN production_material_requirement_basis basis ON basis.id=d.requirement_basis_id
     JOIN production_batches b ON b.id=d.production_batch_id JOIN work_orders w ON w.id=b.work_order_id
     WHERE l.purchase_order_id=? ORDER BY l.id,d.id`,
    [orderId],
  );
  const map = new Map<string, PurchaseOrderLineSource[]>();
  for (const row of rows) {
    const key = String(row.line_id);
    map.set(key, [
      ...(map.get(key) ?? []),
      {
        demandId: String(row.demand_id),
        workOrderId: String(row.work_order_id),
        workOrderNo: row.work_order_no,
        productionBatchId: String(row.production_batch_id),
        batchNo: row.batch_no,
        demandQuantity: String(Number(row.need_number)),
        remainingDemandQuantity: String(Number(row.remaining_number)),
        supplierHint: row.supplier_hint,
      },
    ]);
  }
  return map;
};

export const listRelatedPurchases = async (
  db: Db,
  query: RelatedPurchasesQuery & { page: number; pageSize: number },
): Promise<RelatedPurchasesResult> => {
  const ids = [...new Set(query.demandIds)];
  const [counts] = await db.query<(RowDataPacket & { demand_id: number; order_count: number })[]>(
    `SELECT s.demand_id,COUNT(DISTINCT l.purchase_order_id) order_count FROM procurement_order_line_source s
     JOIN procurement_order_line l ON l.id=s.purchase_order_line_id WHERE s.demand_id IN (${idsSql(ids)}) GROUP BY s.demand_id`,
    ids,
  );
  const countMap = new Map(counts.map((row) => [String(row.demand_id), Number(row.order_count)]));
  const filter = `EXISTS(SELECT 1 FROM procurement_order_line_source source WHERE source.purchase_order_line_id=l.id AND source.demand_id IN (${idsSql(ids)}))`;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM procurement_order_line l WHERE ${filter}`,
    ids,
  );
  const [rows] = await db.query<
    (OrderLineRow & {
      purchase_no: string;
      order_status: PurchaseOrderItem['status'];
      supplier_name: string;
      supplement_reason: PurchaseOrderItem['supplementReason'];
    })[]
  >(
    `SELECT ${LINE_COLUMNS},o.purchase_no,o.status order_status,o.supplement_reason,s.supplier_name
     FROM procurement_order_line l JOIN procurement_order o ON o.id=l.purchase_order_id
     JOIN procurement_supplier s ON s.id=l.supplier_id WHERE ${filter}
     ORDER BY o.created_at DESC,o.id DESC,l.line_no,l.id LIMIT ? OFFSET ?`,
    [...ids, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const sources = await readSourceIds(
    db,
    rows.map((row) => String(row.id)),
  );
  return {
    page: query.page,
    pageSize: query.pageSize,
    total: Number(count?.total ?? 0),
    summaries: ids.map((demandId) => ({
      demandId,
      purchaseOrderCount: countMap.get(demandId) ?? 0,
    })),
    items: rows.map((row) => ({
      purchaseOrderId: String(row.purchase_order_id),
      purchaseNo: row.purchase_no,
      purchaseOrderStatus: row.order_status,
      purchaseOrderLineId: String(row.id),
      lineStatus: row.status,
      supplierId: String(row.supplier_id),
      supplierName: row.supplier_name,
      supplementReason: row.supplement_reason,
      plannedQuantity: String(row.planned_quantity),
      demandIds: sources.get(String(row.id)) ?? [],
    })),
  };
};
