import type {
  DemandType,
  DemandBusinessStatus,
  ProductionBatchStatus,
  WorkOrderStatus,
} from './statuses.js';
import type { WorkOrderType } from './work-order.js';

export interface ProductionExecutionStartMaterialLine {
  demandId: string;
  demandType: DemandType;
  businessStatus: DemandBusinessStatus;
  itemId: string;
  itemCode: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  demandQuantity: string;
  confirmedOutboundQuantity: string;
  remainingQuantity: string;
}

export interface ProductionExecutionStartMaterialSnapshot {
  /** 批量已完整初配 BOM；研发曾有至少一条正式需求，不要求当前仍活动或未履约。 */
  hasInitialMaterialConfiguration: boolean;
  hasMaterialShortage: boolean;
  lines: ProductionExecutionStartMaterialLine[];
}

export interface ProductionExecutionStartCheck extends ProductionExecutionStartMaterialSnapshot {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  version: number;
  orderType: WorkOrderType;
  workOrderStatus: WorkOrderStatus;
  requiresReason: boolean;
  canStart: boolean;
  blockedReason: string | null;
}
