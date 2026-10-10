import type { VersionedCommand } from '../common.js';
import type { DemandCorrectionTrace } from './demand-correction.js';
import type {
  ProductionBatchStatus,
  DemandType,
  DemandGenerationGroupType,
  DemandBusinessStatus,
  MaterialDemandProgressStatus,
  AllocationStatus,
  InventorySourceType,
} from './statuses.js';

export interface ProductionItemDemandItem {
  id: string;
  productionBatchId: string;
  productMaterialId: string | null;
  itemId: string;
  /** Frozen base-material formula and exact selected stock identity. */
  requirementBasisId: string | null;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  quantityPerUnit: string | null;
  unit: string;
  plannedOutputQuantity: string | null;
  needNumber: string;
  demandType: DemandType;
  businessStatus: DemandBusinessStatus;
  version: number;
}

/** 需求生成动作的稳定追溯投影；展示文案由前端共享映射生成。 */
export interface DemandGenerationSource {
  generationGroupKey: string;
  generationGroupType: DemandGenerationGroupType;
  supplementNo: string | null;
  /** 生成动作的说明；当前用于人工追加原因。 */
  generationReason?: string | null;
}

export interface ProductionMaterialAllocationItem {
  allocationId: string;
  demandId: string;
  productionBatchId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemBatchId: string;
  batchCode: string;
  assignedQuantity: string;
  outboundQuantity: string;
  pendingOutboundQuantity: string;
  availableToOrderQuantity: string;
  remainingOutboundQuantity: string;
  unit: string;
  allocationStatus: AllocationStatus;
  version: number;
  remark: string | null;
  createdAt: string;
}

export interface ProductionMaterialDemandItem extends DemandGenerationSource {
  correction?: DemandCorrectionTrace;
  demandId: string;
  productionBatchId: string;
  productMaterialId: string | null;
  itemId: string;
  requirementBasisId: string | null;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  unit: string;
  demandQuantity: string;
  remainingDemandQuantity: string;
  allocatedQuantity: string;
  outboundQuantity: string;
  remainingQuantity: string;
  demandType: DemandType;
  supplementId: string | null;
  createdAt: string;
  businessStatus: DemandBusinessStatus;
  fulfilledById: string | null;
  fulfilledAt: string | null;
  /** 当前需求行自身的分配/出库进度，不是生产任务级汇总状态。 */
  demandProgressStatus: MaterialDemandProgressStatus;
  version: number;
  allocations: ProductionMaterialAllocationItem[];
}

export interface AvailableItemBatchItem {
  itemBatchId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  batchCode: string;
  unit: string;
  sourceType: InventorySourceType;
  provider: string | null;
  productionDate: string | null;
  onHandAvailableQuantity: string;
  reservedQuantity: string;
  availableToAllocateQuantity: string;
}

export interface CreateMaterialAllocationLinePayload {
  demandId: string;
  itemBatchId: string;
  assignedQuantity: number;
  remark?: string | null;
}

export interface CreateMaterialAllocationsPayload {
  allocations: CreateMaterialAllocationLinePayload[];
}

export interface MaterialAllocationCommandResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  allocations: ProductionMaterialAllocationItem[];
}

export type ReleaseMaterialAllocationPayload = VersionedCommand;
