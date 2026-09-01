import type { VersionedCommand } from '../common.js';
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
  productMaterialId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantityPerUnit: string;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  plannedOutputQuantity: string;
  needNumber: string;
  demandType: DemandType;
  businessStatus: DemandBusinessStatus;
  version: number;
}

export interface ProductionMaterialAllocationItem {
  allocationId: string;
  demandId: string;
  productionBatchId: string;
  itemId: string;
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

export interface ProductionMaterialDemandItem {
  demandId: string;
  productionBatchId: string;
  productMaterialId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  demandQuantity: string;
  remainingDemandQuantity: string;
  allocatedQuantity: string;
  outboundQuantity: string;
  remainingQuantity: string;
  demandType: DemandType;
  generationGroupKey: string;
  generationGroupType: DemandGenerationGroupType;
  supplementId: string | null;
  supplementNo: string | null;
  createdAt: string;
  businessStatus: DemandBusinessStatus;
  fulfilledById: string | null;
  fulfilledAt: string | null;
  /** 当前需求行自身的分配/出库进度，不是生产任务级汇总状态。 */
  demandProgressStatus: MaterialDemandProgressStatus;
  version: number;
  allocations: ProductionMaterialAllocationItem[];
}

export type ShortBatchAuthorizationStatus = 'none' | 'valid' | 'stale' | 'consumed';

export interface ShortBatchAuthorizationPreviewLine {
  demandId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  demandQuantity: string;
  confirmedOutboundQuantity: string;
  expectedOutboundQuantity: string;
  authorizedRemainingQuantity: string;
}

export interface ShortBatchAuthorizationPreview {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  materialPlanVersion: number;
  authorizationStatus: ShortBatchAuthorizationStatus;
  canAuthorize: boolean;
  blockedReason: string | null;
  lines: ShortBatchAuthorizationPreviewLine[];
}

export interface AuthorizeShortBatchPayload extends VersionedCommand {
  reason: string;
}

export interface ShortBatchAuthorizationResult {
  authorizationId: string;
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  materialPlanVersion: number;
  status: 'active';
  reason: string;
  authorizedById: string;
  authorizedAt: string;
  lines: ShortBatchAuthorizationPreviewLine[];
}

export interface CloseRemainingMaterialDemandsResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  materialPlanVersion: number;
  cancelledDemandCount: number;
  releasedAllocationCount: number;
}

export interface AvailableItemBatchItem {
  itemBatchId: string;
  itemId: string;
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
