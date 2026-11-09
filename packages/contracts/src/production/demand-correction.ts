import type { DemandBusinessStatus, DemandCloseCause, DemandType } from './statuses.js';

export type DemandCorrectionKind = 'quantity' | 'close';
export interface DemandCorrectionTrace {
  pendingCorrectionId: string | null;
  replacesDemandId: string | null;
  replacementDemandId: string | null;
  closeCause: DemandCloseCause | null;
  closeReason: string | null;
  closedById: string | null;
  closedAt: string | null;
  correctionApprovalId: string | null;
}
export interface DemandCorrectionChainItem {
  demandId: string;
  replacesDemandId: string | null;
  demandQuantity: string;
  remainingQuantity: string;
  outboundQuantity: string;
  businessStatus: DemandBusinessStatus;
  closeCause: DemandCloseCause | null;
}
export interface DemandCorrectionReservation {
  allocationId: string;
  inventoryBatchCode: string;
  quantity: string;
  version: number;
}
export interface DemandCorrectionCheck {
  demandId: string;
  batchId: string;
  batchNo: string;
  workOrderNo: string;
  materialId: string;
  itemCode: string;
  materialVariantCode: string;
  unit: string;
  demandType: DemandType;
  manualAdditionId: string | null;
  sourceReason: string | null;
  version: number;
  currentTotalQuantity: string;
  issuedQuantity: string;
  oldRemainingQuantity: string;
  pendingCorrectionId: string | null;
  chain: DemandCorrectionChainItem[];
  reservations: DemandCorrectionReservation[];
  pendingOutboundNos: string[];
  blockers: string[];
  canCorrect: boolean;
  checkToken: string;
}
export interface SubmitDemandCorrectionPayload {
  version: number;
  checkToken: string;
  kind: DemandCorrectionKind;
  targetTotalQuantity: number;
  reason: string;
}
export interface DemandCorrectionApprovalSnapshot {
  kind: 'demand_correction';
  correctionId: string;
  check: DemandCorrectionCheck;
  correctionKind: DemandCorrectionKind;
  targetTotalQuantity: number;
  newRemainingQuantity: number;
  reason: string;
}
export interface DemandCorrectionHistoryItem {
  id: string;
  oldDemandId: string;
  newDemandId: string | null;
  approvalInstanceId: string | null;
  state: 'draft' | 'pending' | 'applied' | 'ended';
  snapshot: DemandCorrectionApprovalSnapshot;
  createdAt: string;
  appliedAt: string | null;
}
export interface ProductionApprovalResult {
  subjectId: string;
  approvalInstanceId: string;
}
