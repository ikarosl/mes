import type { VersionedCommand } from '../common.js';
import type { BatchTerminationCheck } from './termination.js';
import type { BatchCloseoutApprovalSnapshot } from './closeout.js';

export type ProductionCloseoutMode = 'normal' | 'early';
export type ProductionOutputStatus = 'draft' | 'reviewing' | 'approved' | 'correcting';
export interface ProductionOutputQuantities {
  /** 计划内可入库产出，不超过任务计划。 */
  availableQuantity: number;
  /** 计划外可入库产出，独立于计划内数量。 */
  extraQuantity: number;
  /** 此前未记录的新增成品报废，不含工序历史报废或原材料损耗。 */
  additionalScrapQuantity: number;
}
export interface ProductionOutputDraft extends ProductionOutputQuantities {
  reason: string;
  materialReviewNote: string;
  inspectionRecordId: string | null;
}
export interface ProductionOutputInspection {
  id: string;
  closeoutId: string;
  batchId: string;
  declaredVersion: number;
  declared: ProductionOutputQuantities;
  inspected: ProductionOutputQuantities;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
  previousInspectionId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}
export interface ProductionOutputRevision {
  id: string;
  closeoutId: string;
  batchId: string;
  revisionNo: number;
  previousRevisionId: string | null;
  approvalInstanceId: string;
  inspectionRecordId: string;
  plannedQuantity: string;
  availableQuantity: string;
  extraQuantity: string;
  additionalScrapQuantity: string;
  existingScrapQuantity: string;
  correctionReason: string | null;
  approvedBy: string;
  approvedByName: string;
  approvedAt: string;
  snapshot: BatchCloseoutApprovalSnapshot;
}
export interface ProductionOutputReceipts {
  productionInboundId: string | null;
  productionReceivedQuantity: string;
  extraInboundId: string | null;
  extraReceivedQuantity: string;
}
export interface ProductionOutputDetail {
  id: string;
  batchId: string;
  version: number;
  mode: ProductionCloseoutMode;
  status: ProductionOutputStatus;
  check: BatchTerminationCheck;
  workOrderOwnerId: string;
  workOrderOwnerName: string;
  draft: ProductionOutputDraft | null;
  correctionReason: string | null;
  approvalInstanceId: string | null;
  pendingApprovalId: string | null;
  currentRevisionId: string | null;
  latestInspectionId: string | null;
  inspections: ProductionOutputInspection[];
  revisions: ProductionOutputRevision[];
  receipts: ProductionOutputReceipts;
  canEdit: boolean;
  canRecordInspection: boolean;
  canSubmit: boolean;
  canBeginCorrection: boolean;
  canCancelCorrection: boolean;
  blockers: string[];
  /** 草稿、检验引用、基准批准版及收尾依据的联合指纹。 */
  submissionToken: string;
}
export interface SaveProductionOutputPayload extends VersionedCommand, ProductionOutputDraft {}
export interface RecordProductionOutputInspectionPayload extends VersionedCommand {
  inspected: ProductionOutputQuantities;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
}
export interface SubmitProductionOutputPayload extends VersionedCommand {
  submissionToken: string;
}

export interface ReviewProductionOutputMaterialPayload extends VersionedCommand {
  checkToken: string;
  targetId: string;
  reason: string;
}
export interface BeginProductionOutputCorrectionPayload extends VersionedCommand {
  currentRevisionId: string;
  reason: string;
}
export interface ProductionOutputCommandResult {
  closeoutId: string;
  batchId: string;
  inspectionRecordId?: string;
}
