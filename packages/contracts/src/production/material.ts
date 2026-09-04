import type { VersionedCommand } from '../common.js';
import type {
  ProductionBatchStatus,
  DemandType,
  DemandGenerationGroupType,
  DemandBusinessStatus,
  MaterialDemandProgressStatus,
  ShortBatchAuthorizationAction,
  ShortBatchAuthorizationCoverage,
  AllocationStatus,
  InventorySourceType,
} from './statuses.js';

export interface ProductionItemDemandItem {
  id: string;
  productionBatchId: string;
  productMaterialId: string;
  itemId: string;
  /** Frozen base-material formula and exact selected stock identity. */
  requirementBasisId: string;
  materialVariantId: string;
  materialVariantCode: string;
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

/** 需求生成动作的稳定追溯投影；展示文案由前端共享映射生成。 */
export interface DemandGenerationSource {
  generationGroupKey: string;
  generationGroupType: DemandGenerationGroupType;
  supplementNo: string | null;
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
  demandId: string;
  productionBatchId: string;
  productMaterialId: string;
  itemId: string;
  requirementBasisId: string;
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

export type ShortBatchAuthorizationStatus = 'none' | 'valid' | 'stale' | 'consumed';

export interface ShortBatchAuthorizationPreviewLine extends DemandGenerationSource {
  demandId: string;
  itemId: string;
  materialVariantId: string;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  unit: string;
  demandQuantity: string;
  confirmedOutboundQuantity: string;
  expectedOutboundQuantity: string;
  authorizedRemainingQuantity: string;
  /** 既有有效或失效授权的允许缺口；从未授权时为空。 */
  existingAuthorizedRemainingQuantity: string | null;
}

export interface ShortBatchAuthorizationPreview {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  materialPlanVersion: number;
  authorizationStatus: ShortBatchAuthorizationStatus;
  authorizationAction: ShortBatchAuthorizationAction;
  authorizationCoverage: ShortBatchAuthorizationCoverage;
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
