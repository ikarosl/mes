import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  PurchaseOrderItem,
  PurchaseFulfillmentMode,
  PurchaseOrderLineStatus,
  PurchaseOrderTotalAmountSource,
} from '@company/contracts';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';

export type Db = Pool | PoolConnection;
export type OrderRow = RowDataPacket & {
  id: number;
  purchase_no: string;
  supplier_id: number;
  work_order_id: number | null;
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
  fulfillment_mode: PurchaseFulfillmentMode;
  id: number;
  purchase_order_id: number;
  tax_exclusive_amount: string | null;
  tax_inclusive_amount: string | null;
  tax_rate_percent: string;
  total_amount: string | null;
  total_amount_source: PurchaseOrderTotalAmountSource | null;
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
  supplement_evidence: string | null;
};
export const idsSql = (ids: readonly string[]) => ids.map(() => '?').join(',');
export const sortedIds = (ids: readonly string[]) =>
  [...new Set(ids)].sort((a, b) => {
    if (BigInt(a) < BigInt(b)) return -1;
    if (BigInt(a) > BigInt(b)) return 1;
    return 0;
  });
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
    `SELECT * FROM procurement_order WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!row) return orderError('采购单不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
  return row;
};
export const readLines = async (db: Db, id: string, lock = false): Promise<OrderLineRow[]> => {
  const [rows] = await db.query<OrderLineRow[]>(
    `SELECT * FROM procurement_order_line WHERE purchase_order_id=? ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
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
    `SELECT purchase_order_line_id,demand_id FROM procurement_order_line_source WHERE purchase_order_line_id IN (${idsSql(lineIds)}) ORDER BY purchase_order_line_id,demand_id${lock ? ' FOR SHARE' : ''}`,
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
  row: OrderRow & { work_order_no: string | null; line_count: number; supplier_name: string },
): PurchaseOrderItem => ({
  id: String(row.id),
  purchaseNo: row.purchase_no,
  supplierId: String(row.supplier_id),
  supplierName: row.supplier_name,
  workOrderId: row.work_order_id === null ? null : String(row.work_order_id),
  workOrderNo: row.work_order_no,
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

export const hasOrderReceiptFacts = async (db: Db, id: string, lock = false): Promise<boolean> => {
  const [[arrival]] = await db.query<RowDataPacket[]>(
    `SELECT id FROM procurement_receipt_line WHERE purchase_order_id=? ORDER BY id LIMIT 1${lock ? ' FOR SHARE' : ''}`,
    [id],
  );
  return Boolean(arrival);
};

export const requireDraft = (order: OrderRow) => {
  if (order.status !== 'draft')
    orderError('只有采购草稿可以修改或下单', PROCUREMENT_ERROR_CODES.purchaseOrderState);
};
