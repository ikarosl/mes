import type { RowDataPacket } from 'mysql2/promise';
import type {
  AvailableItemBatchItem,
  MaterialDemandProgressStatus,
  MaterialOutboundItem,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';

export type DemandRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  product_material_id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  unit_snapshot: string;
  need_number: string;
  demand_type: ProductionMaterialDemandItem['demandType'];
  business_status: ProductionMaterialDemandItem['businessStatus'];
  version: number;
  allocated_quantity: string;
  outbound_quantity: string;
};

export type AllocationRow = RowDataPacket & {
  id: number;
  demand_id: number;
  production_batch_id: number;
  item_id: number;
  batch_id: number;
  batch_code: string;
  assigned_number: string;
  outbound_quantity: string;
  pending_outbound_quantity: string;
  unit_snapshot: string;
  allocation_status: ProductionMaterialAllocationItem['allocationStatus'];
  version: number;
  remark: string | null;
  created_at: Date;
};

export type AvailableRow = RowDataPacket & {
  id: number;
  item_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  batch_code: string;
  unit_snapshot: string;
  source_type: AvailableItemBatchItem['sourceType'];
  provider: string | null;
  production_date: string | null;
  on_hand: string;
  reserved: string;
};

export type OutboundRow = RowDataPacket & {
  id: number;
  outbound_no: string;
  production_batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code: string;
  product_name: string;
  status: MaterialOutboundItem['status'];
  outbound_at: Date | null;
  operator_id: number | null;
  created_by: number | null;
  created_at: Date;
  version: number;
  remark: string | null;
};

export type OutboundDetailRow = RowDataPacket & {
  id: number;
  outbound_id: number;
  allocation_id: number;
  demand_id: number;
  item_id: number;
  batch_id: number;
  batch_code: string;
  item_code_snapshot: string;
  product_name_snapshot: string;
  outbound_number: string;
  unit_snapshot: string;
  inventory_transaction_id: number | null;
};

export const DEMAND_SELECT = `SELECT d.id,d.production_batch_id,d.product_material_id,d.item_id,'' item_code,'' item_name,d.unit_snapshot,d.need_number,d.demand_type,d.business_status,d.version,
  COALESCE((SELECT SUM(a.assigned_number) FROM production_item_allocation a WHERE a.demand_id=d.id AND a.allocation_status NOT IN ('released','cancelled')),0) allocated_quantity,
  COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.demand_id=d.id AND oo.status='completed'),0) outbound_quantity
  FROM production_item_demand d`;

export const ALLOCATION_SELECT = `SELECT a.id,a.demand_id,a.production_batch_id,a.item_id,a.batch_id,ib.batch_code,a.assigned_number,
  COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0) outbound_quantity,
  COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='pending_picking'),0) pending_outbound_quantity,
  a.unit_snapshot,a.allocation_status,a.version,a.remark,a.created_at
  FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id`;

export const mapAllocation = (row: AllocationRow): ProductionMaterialAllocationItem => ({
  allocationId: String(row.id),
  demandId: String(row.demand_id),
  productionBatchId: String(row.production_batch_id),
  itemId: String(row.item_id),
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  assignedQuantity: row.assigned_number,
  outboundQuantity: row.outbound_quantity,
  pendingOutboundQuantity: row.pending_outbound_quantity,
  availableToOrderQuantity: decimal(
    Math.max(
      0,
      Number(row.assigned_number) -
        Number(row.outbound_quantity) -
        Number(row.pending_outbound_quantity),
    ),
  ),
  remainingOutboundQuantity: decimal(
    Math.max(0, Number(row.assigned_number) - Number(row.outbound_quantity)),
  ),
  unit: row.unit_snapshot,
  allocationStatus: row.allocation_status,
  version: row.version,
  remark: row.remark,
  createdAt: toBeijingISOString(row.created_at),
});

export const mapDemand = (
  row: DemandRow,
  allocations: ProductionMaterialAllocationItem[],
): ProductionMaterialDemandItem => ({
  demandId: String(row.id),
  productionBatchId: String(row.production_batch_id),
  productMaterialId: String(row.product_material_id),
  itemId: String(row.item_id),
  itemCode: row.item_code,
  itemName: row.item_name,
  unit: row.unit_snapshot,
  demandQuantity: row.need_number,
  allocatedQuantity: row.allocated_quantity,
  outboundQuantity: row.outbound_quantity,
  remainingQuantity: decimal(Math.max(0, Number(row.need_number) - Number(row.allocated_quantity))),
  demandType: row.demand_type,
  businessStatus: row.business_status,
  progressStatus: progress(row),
  version: row.version,
  allocations,
});

const progress = (row: DemandRow): MaterialDemandProgressStatus => {
  if (row.business_status !== 'active') return row.business_status;
  const need = Number(row.need_number);
  const allocated = Number(row.allocated_quantity);
  const outbound = Number(row.outbound_quantity);
  if (outbound >= need) return 'outbound';
  if (outbound > 0 && allocated < need) return 'shortage';
  if (outbound > 0) return 'partially_outbound';
  if (allocated >= need) return 'allocated';
  if (allocated > 0) return 'partially_allocated';
  return 'pending_allocation';
};

export const decimal = (value: number): string => value.toFixed(4);
export const placeholders = (ids: string[]): string => ids.map(() => '?').join(',');
export const bigintCompare = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
export const dateOnly = (value: Date | string | null): string | null =>
  value === null ? null : typeof value === 'string' ? value : value.toISOString().slice(0, 10);
