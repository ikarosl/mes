import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  PurchaseOrderItem,
  PurchaseOrderLineStatus,
  PurchaseOrderLineClosure,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';

export type Db = Pool | PoolConnection;
export type OrderRow = RowDataPacket & {
  id: number;
  purchase_no: string;
  supplier_id: number;
  source_type: PurchaseOrderItem['sourceType'];
  supplement_reason: PurchaseOrderItem['supplementReason'];
  status: PurchaseOrderItem['status'];
  remark: string | null;
  version: number;
  ordered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
export type OrderLineRow = RowDataPacket & {
  id: number;
  purchase_order_id: number;
  line_no: number;
  item_id: number;
  material_variant_id: number;
  item_code_snapshot: string;
  material_variant_code_snapshot: string;
  unit_snapshot: string;
  planned_quantity: number;
  status: PurchaseOrderLineStatus;
  version: number;
  origin_order_line_id: number | null;
  origin_receipt_line_id: number | null;
  origin_supplier_return_id: number | null;
  supplement_evidence: string | null;
};
export type ClosureRow = RowDataPacket & {
  id: number;
  purchase_order_line_id: number;
  reason_type: PurchaseOrderLineClosure['reasonType'];
  reason: string | null;
  planned_quantity: number;
  received_quantity: number;
  undetermined_quantity: number;
  approved_quantity: number;
  inbound_quantity: number;
  return_due_quantity: number;
  returned_quantity: number;
  quality_returned_quantity: number;
  created_at: Date;
};
export const idsSql = (ids: readonly string[]) => ids.map(() => '?').join(',');
export const sortedIds = (ids: readonly string[]) =>
  [...new Set(ids)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
export const orderError = (
  message: string,
  code:
    | 'PURCHASE_ORDER_NOT_FOUND'
    | 'INVALID_PURCHASE_ORDER'
    | 'PURCHASE_ORDER_STATE'
    | 'PROCUREMENT_SOURCE_UNAVAILABLE' = PROCUREMENT_ERROR_CODES.invalidPurchaseOrder,
): never => {
  throw new ProcurementDomainError(code, message);
};
export const readOrder = async (db: Db, id: string, lock = false): Promise<OrderRow> => {
  const [[row]] = await db.query<OrderRow[]>(
    `SELECT * FROM purchase_order WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!row) return orderError('采购单不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
  return row;
};
export const readLines = async (db: Db, id: string, lock = false): Promise<OrderLineRow[]> => {
  const [rows] = await db.query<OrderLineRow[]>(
    `SELECT * FROM purchase_order_line WHERE purchase_order_id=? ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows;
};
export const readSourceIds = async (
  db: Db,
  lineIds: string[],
  lock = false,
): Promise<Map<string, string[]>> => {
  if (!lineIds.length) return new Map();
  const [rows] = await db.query<
    (RowDataPacket & { purchase_order_line_id: number; demand_id: number })[]
  >(
    `SELECT purchase_order_line_id,demand_id FROM purchase_order_line_source WHERE purchase_order_line_id IN (${idsSql(lineIds)}) ORDER BY purchase_order_line_id,demand_id${lock ? ' FOR SHARE' : ''}`,
    lineIds,
  );
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const id = String(row.purchase_order_line_id);
    map.set(id, [...(map.get(id) ?? []), String(row.demand_id)]);
  }
  return map;
};
export const mapOrder = (
  row: OrderRow & { supplier_name: string; line_count: number },
): PurchaseOrderItem => ({
  id: String(row.id),
  purchaseNo: row.purchase_no,
  supplierId: String(row.supplier_id),
  supplierName: row.supplier_name,
  sourceType: row.source_type,
  supplementReason: row.supplement_reason,
  status: row.status,
  remark: row.remark,
  version: row.version,
  lineCount: Number(row.line_count),
  orderedAt: row.ordered_at ? toBeijingISOString(row.ordered_at) : null,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});
export const mapClosure = (row: ClosureRow): PurchaseOrderLineClosure => ({
  id: String(row.id),
  reasonType: row.reason_type,
  reason: row.reason,
  plannedQuantity: String(row.planned_quantity),
  receivedQuantity: String(row.received_quantity),
  undeterminedQuantity: String(row.undetermined_quantity),
  approvedQuantity: String(row.approved_quantity),
  inboundQuantity: String(row.inbound_quantity),
  returnDueQuantity: String(row.return_due_quantity),
  returnedQuantity: String(row.returned_quantity),
  qualityReturnedQuantity: String(row.quality_returned_quantity),
  createdAt: toBeijingISOString(row.created_at),
});
