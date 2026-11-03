import type { QualityInspectionMethod, QualityReleaseDecision } from './inspection.js';
import type { JsonTableData } from '../template.js';

export type QualityInboundCaseType =
  'initial' | 'reinspection' | 'inspection_correction' | 'receipt_correction';
export type QualityInboundCaseStatus = 'reviewing' | 'completed' | 'superseded';
export type QualityInboundInspectionMethod = Exclude<QualityInspectionMethod, 'zero_confirmation'>;

export interface QualityInboundInspectionInput {
  inspectionMethod: QualityInboundInspectionMethod;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  releaseDecision: QualityReleaseDecision;
  inspectedAt: string;
  evidence: string;
  /** 本次填写所依据的默认模板，仅在提交时核对，不作为历史记录的读取来源。 */
  inspectionTemplateId: string;
  inspectionTemplateVersion: number;
  inspectionDetails: JsonTableData;
}

export interface QualityInboundInspectionItem {
  id: string;
  caseId: string;
  receiptLineId: string;
  receiptRevisionId: string;
  inspectionMethod: QualityInboundInspectionMethod;
  qualifiedQuantity: string;
  unqualifiedQuantity: string;
  inspectedQuantity: string;
  releaseDecision: QualityReleaseDecision;
  previousRecordId: string | null;
  inspectedAt: string;
  /** 历史来料检查说明；新登记不再填写。 */
  remark: string | null;
  evidence: string;
  inspectionDetails: JsonTableData | null;
  createdBy: string;
  createdAt: string;
}

export interface QualityInboundCaseItem {
  id: string;
  receiptLineId: string;
  receiptRevisionId: string;
  roundId: string;
  caseType: QualityInboundCaseType;
  status: QualityInboundCaseStatus;
  coveredQuantity: string;
  reason: string;
  version: number;
  completedBy: string | null;
  completedAt: string | null;
  supersededByRoundId: string | null;
  supersededReason: string | null;
  createdBy: string;
  createdAt: string;
  inspection: QualityInboundInspectionItem | null;
}
