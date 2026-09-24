import type { ProductionOutputInspection } from '../quality/finished-inspections.js';
import type { ProductionCloseoutMode, ProductionOutputDraft } from './output.js';
import type { BatchTerminationCheck, BatchTerminationImpact } from './termination.js';
import type { DemandBusinessStatus, DemandType } from './statuses.js';

/** 收尾操作页的当前投影，不回写原需求或已经固化的审批证据。 */
export interface BatchCloseoutDemand {
  id: string;
  demandType: DemandType;
  status: DemandBusinessStatus;
  itemCode: string;
  materialVariantCode: string;
  unit: string;
  demandQuantity: string;
  remainingQuantity: string;
  outboundQuantity: string;
  parentDemandId: string | null;
  replacesDemandId: string | null;
  supplementId: string | null;
}
export interface BatchCloseoutPendingItem extends BatchTerminationImpact {
  demandIds: string[];
  blockedReason: string | null;
}
export interface BatchCloseoutMaterialReview {
  allocationId: string;
  demandId: string;
  status: 'pending' | 'reviewed' | 'stale';
  reason: string | null;
  actorId: string | null;
  reviewedAt: string | null;
}

export type BatchCloseoutItemKind = BatchTerminationImpact['kind'] | 'material';
export interface BatchCloseoutAction {
  id: string;
  kind: BatchCloseoutItemKind;
  targetId: string;
  label: string;
  previousStatus: string;
  resultingStatus: string;
  quantity: string | null;
  unit: string | null;
  reason: string;
  actorId: string;
  createdAt: string;
}
export type BatchCloseoutOutput = ProductionOutputDraft;
export interface BatchCloseoutDetail {
  id: string;
  batchId: string;
  reason: string;
  version: number;
  approvalInstanceId: string | null;
  pendingApprovalId: string | null;
  mode: ProductionCloseoutMode;
  currentRevisionId: string | null;
  demands: BatchCloseoutDemand[];
  pendingItems: BatchCloseoutPendingItem[];
  materialReviews: BatchCloseoutMaterialReview[];
  actions: BatchCloseoutAction[];
  check: BatchTerminationCheck;
  canHandle: boolean;
  blockers: string[];
}
/** 送审时从已锁定工单读取，与审批节点解析人员使用同一份事实。 */
export interface BatchCloseoutWorkOrderOwnerEvidence {
  sourceCode: 'production.work_order_owner';
  workOrderId: string;
  workOrderNo: string;
  workOrderVersion: number;
  ownerId: string;
}
export interface BatchCloseoutApprovalSnapshot {
  kind: 'batch_closeout';
  mode: ProductionCloseoutMode;
  previousRevisionId: string | null;
  correctionReason: string | null;
  inspection: ProductionOutputInspection;
  closeoutId: string;
  workOrderOwnerEvidence: BatchCloseoutWorkOrderOwnerEvidence;
  check: BatchTerminationCheck;
  output: BatchCloseoutOutput;
  actions: BatchCloseoutAction[];
}
export interface BeginBatchCloseoutPayload {
  version: number;
  reason: string;
}
export interface HandleBatchCloseoutItemPayload {
  version: number;
  checkToken: string;
  kind: BatchCloseoutItemKind;
  targetId: string;
  targetVersion: number;
  reason: string;
}
export interface BatchCloseoutCommandResult {
  closeoutId: string;
  batchId: string;
}

export interface RecordCloseoutMaterialLossPayload {
  version: number;
  checkToken: string;
  allocationId: string;
  scrapQuantity: number;
  reason: string;
}
export interface RecordCloseoutMaterialLossResult extends BatchCloseoutCommandResult {
  scrapId: string;
}
