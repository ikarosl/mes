import type { PageQuery } from '../common.js';
import type {
  DemandBusinessStatus,
  DemandType,
  ProductionBatchStatus,
  WorkOrderStatus,
} from '../production/statuses.js';

export interface ProcurementDemandCandidateQuery extends PageQuery {
  keyword?: string;
  workOrderId?: string;
  batchId?: string;
  itemId?: string;
  demandType?: DemandType;
}

/** 需求自身的事实与当前展示，不包含采购分摊量、库存预留或齐套门禁。 */
export interface ProcurementDemandCandidate {
  demandId: string;
  workOrderId: string;
  workOrderNo: string;
  workOrderStatus: WorkOrderStatus;
  productionBatchId: string;
  batchNo: string;
  batchStatus: ProductionBatchStatus;
  itemId: string;
  itemCode: string;
  itemName: string;
  materialVariantId: string;
  materialVariantCode: string;
  unit: string;
  demandType: DemandType;
  demandQuantity: string;
  remainingDemandQuantity: string;
  businessStatus: DemandBusinessStatus;
  pendingCorrectionId: string | null;
}

/** 不在当前候选窗口中的历史需求仍返回 demand；仅不存在的 ID 返回 null。 */
export interface ProcurementDemandResolution {
  demandId: string;
  demand: ProcurementDemandCandidate | null;
  eligible: boolean;
  blockedReason: string | null;
}
