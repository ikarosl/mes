import type { RowDataPacket } from 'mysql2/promise';
import type {
  AvailableItemBatchItem,
  MaterialDemandProgressStatus,
  MaterialOutboundItem,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { fixedIntegerQuantity, integerQuantity } from '../domain/integer-quantity.js';

export type DemandRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  requirement_basis_id: number;
  product_material_id: number;
  item_id: number;
  material_variant_id: number;
  item_code_snapshot: string;
  item_name_snapshot: string;
  material_variant_code_snapshot: string;
  unit_snapshot: string;
  need_number: string;
  remaining_number: string;
  demand_type: ProductionMaterialDemandItem['demandType'];
  generation_group_key: string;
  supplement_id: number | null;
  supplement_no: string | null;
  business_status: ProductionMaterialDemandItem['businessStatus'];
  fulfilled_by: number | null;
  fulfilled_at: Date | null;
  version: number;
  created_at: Date;
  allocated_quantity: string;
  outbound_quantity: string;
};

export type AllocationRow = RowDataPacket & {
  id: number;
  demand_id: number;
  production_batch_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  batch_code: string;
  material_variant_code_snapshot: string;
  assigned_number: string;
  outbound_quantity: string;
  pending_outbound_quantity: string;
  unit_snapshot: string;
  allocation_status: ProductionMaterialAllocationItem['allocationStatus'];
  version: number;
  remark: string | null;
  created_at: Date;
  demand_type: ProductionMaterialDemandItem['demandType'];
  generation_group_key: string;
  supplement_no: string | null;
};

export type AvailableRow = RowDataPacket & {
  id: number;
  item_id: number;
  material_variant_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  material_variant_code_snapshot: string;
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
  short_batch_authorization_id: number | null;
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
  cancel_source: MaterialOutboundItem['cancelSource'];
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
};

export type OutboundDetailRow = RowDataPacket & {
  id: number;
  outbound_id: number;
  allocation_id: number;
  demand_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  batch_code: string;
  material_variant_code_snapshot: string;
  item_code_snapshot: string;
  product_name_snapshot: string;
  generation_group_key: string;
  generation_group_type: ProductionMaterialDemandItem['generationGroupType'];
  supplement_no: string | null;
  outbound_number: string;
  unit_snapshot: string;
  inventory_transaction_id: number | null;
};

export const DEMAND_SELECT = `SELECT d.id,d.production_batch_id,d.requirement_basis_id,d.product_material_id,d.item_id,d.material_variant_id,d.item_code_snapshot,d.item_name_snapshot,d.material_variant_code_snapshot,d.unit_snapshot,d.need_number,d.remaining_number,d.demand_type,d.generation_group_key,d.supplement_id,s.supplement_no,d.business_status,d.fulfilled_by,d.fulfilled_at,d.version,d.created_at,
  COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((
    SELECT SUM(rd.return_number) FROM return_detail rd JOIN return_order ro ON ro.id=rd.return_id
    WHERE rd.allocation_id=a.id AND ro.status='returned' AND rd.release_after_return=1
  ),0),0)) FROM production_item_allocation a WHERE a.demand_id=d.id AND a.allocation_status NOT IN ('released','cancelled')),0) allocated_quantity,
  GREATEST(COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.demand_id=d.id AND oo.status='completed'),0)-COALESCE((SELECT SUM(rd.return_number) FROM return_detail rd JOIN return_order ro ON ro.id=rd.return_id WHERE rd.demand_id=d.id AND ro.status='returned' AND rd.release_after_return=1),0),0) outbound_quantity
  FROM production_item_demand d
  LEFT JOIN production_material_supplement s ON s.id=d.supplement_id`;

export const ALLOCATION_SELECT = `SELECT a.id,a.demand_id,a.production_batch_id,a.item_id,a.material_variant_id,a.batch_id,ib.batch_code,ib.material_variant_code_snapshot,d.demand_type,d.generation_group_key,s.supplement_no,
  COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0) outbound_quantity,
  COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status IN ('pending_picking','picked','partially_outbound')),0) pending_outbound_quantity,
  a.unit_snapshot,a.allocation_status,a.version,a.remark,a.created_at
  FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id JOIN production_item_demand d ON d.id=a.demand_id LEFT JOIN production_material_supplement s ON s.id=d.supplement_id`;

export const mapAllocation = (row: AllocationRow): ProductionMaterialAllocationItem => ({
  allocationId: String(row.id),
  demandId: String(row.demand_id),
  productionBatchId: String(row.production_batch_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  assignedQuantity: row.assigned_number,
  outboundQuantity: row.outbound_quantity,
  pendingOutboundQuantity: row.pending_outbound_quantity,
  availableToOrderQuantity: decimal(
    Math.max(
      0,
      integerQuantity(row.assigned_number) -
        integerQuantity(row.outbound_quantity) -
        integerQuantity(row.pending_outbound_quantity),
    ),
  ),
  remainingOutboundQuantity: decimal(
    Math.max(0, integerQuantity(row.assigned_number) - integerQuantity(row.outbound_quantity)),
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
): ProductionMaterialDemandItem => {
  const demandProgressStatus = progress(row);
  return {
    demandId: String(row.id),
    productionBatchId: String(row.production_batch_id),
    productMaterialId: String(row.product_material_id),
    itemId: String(row.item_id),
    requirementBasisId: String(row.requirement_basis_id),
    materialVariantId: String(row.material_variant_id),
    materialVariantCode: row.material_variant_code_snapshot,
    itemCode: row.item_code_snapshot,
    itemName: row.item_name_snapshot,
    unit: row.unit_snapshot,
    demandQuantity: row.need_number,
    remainingDemandQuantity: row.remaining_number,
    allocatedQuantity: row.allocated_quantity,
    outboundQuantity: row.outbound_quantity,
    remainingQuantity: decimal(
      Math.max(0, integerQuantity(row.need_number) - integerQuantity(row.allocated_quantity)),
    ),
    demandType: row.demand_type,
    generationGroupKey: row.generation_group_key,
    generationGroupType: row.demand_type,
    supplementId: row.supplement_id === null ? null : String(row.supplement_id),
    supplementNo: row.supplement_no,
    createdAt: toBeijingISOString(row.created_at),
    businessStatus: row.business_status,
    fulfilledById: row.fulfilled_by === null ? null : String(row.fulfilled_by),
    fulfilledAt: row.fulfilled_at === null ? null : toBeijingISOString(row.fulfilled_at),
    demandProgressStatus,
    version: row.version,
    allocations,
  };
};

const progress = (row: DemandRow): MaterialDemandProgressStatus => {
  // fulfilled 是确认领料出库完成后的持久化业务终态；对外进度统一投影为 outbound。
  if (row.business_status === 'fulfilled') return 'outbound';
  if (row.business_status === 'cancelled') return 'cancelled';
  const need = integerQuantity(row.need_number);
  const allocated = integerQuantity(row.allocated_quantity);
  const outbound = integerQuantity(row.outbound_quantity);
  if (outbound >= need) return 'outbound';
  if (outbound > 0 && allocated < need) return 'shortage';
  if (outbound > 0) return 'partially_outbound';
  if (allocated >= need) return 'allocated';
  if (allocated > 0) return 'partially_allocated';
  return 'pending_allocation';
};

export const decimal = fixedIntegerQuantity;
export const placeholders = (ids: string[]): string => ids.map(() => '?').join(',');
export const bigintCompare = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
