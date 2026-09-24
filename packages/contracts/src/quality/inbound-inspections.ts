import type { QualityInspectionMethod, QualityReleaseDecision } from './inspection.js';
import type { PageQuery } from '../common.js';

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
  remark: string;
  evidence: string;
}

export interface QualityInboundInspectionItem {
  id: string;
  caseId: string;
  receiptLineId: string;
  receiptRevisionId: string;
  coveredQuantity: null;
  inspectionMethod: QualityInboundInspectionMethod;
  qualifiedQuantity: string;
  unqualifiedQuantity: string;
  inspectedQuantity: string;
  releasedQuantity: null;
  releaseDecision: QualityReleaseDecision;
  previousRecordId: string | null;
  inspectedAt: string;
  remark: string;
  evidence: string;
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

export interface QualityInboundCaseQuery extends PageQuery {
  receiptLineIds?: string[];
  status?: QualityInboundCaseStatus;
  caseType?: QualityInboundCaseType;
}
