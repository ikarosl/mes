import type { PageQuery, VersionedCommand } from '../common.js';

export type ProcessInspectionMethod = 'full' | 'sampling';
export type ProcessInspectionStatus = 'active' | 'reversed';
export type ProcessInspectionRecordType = 'normal' | 'reversal';

export interface RecordProcessInspectionPayload {
  inspectionMethod: ProcessInspectionMethod;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  /** 明确本次现场实物范围；已有不合格实物复查不得登记为新增发现。 */
  scopeNote: string;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
}
export interface CreateProcessInspectionPayload extends RecordProcessInspectionPayload {
  batchId: string;
  stepId: string;
}
export interface CorrectProcessInspectionPayload
  extends RecordProcessInspectionPayload, VersionedCommand {
  reason: string;
}
export interface ReverseProcessInspectionPayload extends VersionedCommand {
  reason: string;
}
export interface ProcessInspectionRecord extends RecordProcessInspectionPayload {
  id: string;
  inspectionId: string;
  recordType: ProcessInspectionRecordType;
  inspectedQuantity: number;
  reversalOfRecordId: string | null;
  replacesRecordId: string | null;
  reason: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}
export interface ProcessInspectionStepIdentity {
  batchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  stepId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  productCode: string;
  productName: string;
  unit: string;
}
export interface ProcessInspectionStepSummary extends ProcessInspectionStepIdentity {
  /** 登记次数包含已冲销检查；更正和冲销不增加次数。 */
  inspectionCount: number;
  activeInspectionCount: number;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  acceptedQuantity: number;
  pendingQuantity: number;
  /** 当前有效检查的最近实检时间；全部冲销或尚未登记时为空。 */
  latestInspectedAt: string | null;
  canCreate: boolean;
  createBlockedReason: string | null;
}
export interface ProcessInspectionEntry extends ProcessInspectionStepIdentity {
  id: string;
  status: ProcessInspectionStatus;
  currentRecord: ProcessInspectionRecord | null;
  acceptedQuantity: number;
  pendingQuantity: number;
  canAccept: boolean;
  acceptBlockedReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ProcessInspectionQuery extends PageQuery {
  keyword?: string;
  batchId?: string;
  stepId?: string;
  pendingOnly?: 'true';
}
export interface ProcessInspectionCommandResult {
  inspectionId: string;
  recordId: string;
  version: number;
}
