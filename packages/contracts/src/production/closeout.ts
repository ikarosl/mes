import type { ProductionOutputInspection } from '../quality/finished-inspections.js';
import type { ProductionCloseoutMode, ProductionOutputDraft } from './output.js';
import type {
  BatchTerminationCheck,
  BatchTerminationImpact,
  ProductionReportedNormalComparison,
} from './termination.js';
import type { DemandBusinessStatus, DemandType, ProductionBatchStatus } from './statuses.js';
import type { ProductionTaskCloseoutActionType } from './execution-actions.js';

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
/** 历史任务行动不属于逐项收尾命令的可操作事项。 */
export type BatchCloseoutActionKind = BatchCloseoutItemKind | 'task';
export interface BatchCloseoutAction {
  id: string;
  kind: BatchCloseoutActionKind;
  actionType: ProductionTaskCloseoutActionType | null;
  /** 撤回所关联的进入行动；进入行动本身以 id 为身份。 */
  entryActionId: string | null;
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
  canWithdraw: boolean;
  withdrawBlockedReason: string | null;
  withdrawRestoredStatus: ProductionBatchStatus | null;
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
  check: Omit<BatchTerminationCheck, keyof ProductionReportedNormalComparison>;
  output: BatchCloseoutOutput;
  actions: BatchCloseoutAction[];
}
/** 只读响应补充的引用信息，不写回审批或批准清单的历史 JSON。 */
export interface BatchCloseoutApprovalDisplaySnapshot extends BatchCloseoutApprovalSnapshot {
  /** 按同一结案根的 previousRevisionId 读取真实 revision_no；无前版或引用缺失时为空。 */
  previousRevisionNo: number | null;
}
export interface BeginBatchCloseoutPayload {
  version: number;
  closeoutVersion: number | null;
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

export interface BatchCloseoutWithdrawalCheck {
  batchId: string;
  batchStatus: ProductionBatchStatus;
  version: number;
  closeoutId: string | null;
  closeoutVersion: number | null;
  restoreStatus: ProductionBatchStatus | null;
  canWithdraw: boolean;
  blockedReason: string | null;
}

export interface WithdrawBatchCloseoutPayload {
  version: number;
  closeoutVersion: number;
  reason: string;
}

export interface WithdrawBatchCloseoutResult extends BatchCloseoutCommandResult {
  batchStatus: ProductionBatchStatus;
  version: number;
  closeoutVersion: number;
  entryActionId: string;
  withdrawalActionId: string;
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
