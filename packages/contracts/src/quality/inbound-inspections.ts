import type { PageQuery } from '../common.js';

export type QualityInboundCaseType =
  'initial' | 'reinspection' | 'inspection_correction' | 'receipt_correction';
export type QualityInboundCaseStatus = 'reviewing' | 'completed' | 'superseded';
export type QualityInboundInspectionMethod = 'full' | 'sampling' | 'review_only';
export type QualityInboundDisposition =
  'release' | 'await_full_inspection' | 'await_decision' | 'return_all' | 'receipt_zero_confirmed';

export interface QualityInboundInspectionInput {
  inspectionMethod: QualityInboundInspectionMethod;
  qualifiedQuantity: number | null;
  unqualifiedQuantity: number | null;
  sampleQuantity: number | null;
  sampleUnqualifiedQuantity: number | null;
  removedDefectQuantity: number;
  inboundApproved: boolean;
  disposition: QualityInboundDisposition;
  remark: string;
  evidence: string;
}

export interface QualityInboundInspectionItem {
  id: string;
  caseId: string;
  receiptLineId: string;
  receiptRevisionId: string;
  coveredQuantity: string;
  inspectionMethod: QualityInboundInspectionMethod;
  qualifiedQuantity: string | null;
  unqualifiedQuantity: string | null;
  sampleQuantity: string | null;
  sampleUnqualifiedQuantity: string | null;
  removedDefectQuantity: string;
  inboundApproved: boolean;
  disposition: QualityInboundDisposition;
  approvedQuantity: string;
  qualityReturnQuantity: string;
  undeterminedQuantity: string;
  remark: string;
  evidence: string;
  createdBy: string;
  createdAt: string;
}

export interface QualityInboundCaseItem {
  id: string;
  receiptLineId: string;
  receiptRevisionId: string;
  sourceScopeId: string | null;
  targetScopeId: string | null;
  caseType: QualityInboundCaseType;
  status: QualityInboundCaseStatus;
  coveredQuantity: string;
  reason: string;
  version: number;
  completedBy: string | null;
  completedAt: string | null;
  supersededByReceiptRevisionId: string | null;
  createdBy: string;
  createdAt: string;
  inspection: QualityInboundInspectionItem | null;
}

export interface QualityInboundCaseQuery extends PageQuery {
  receiptLineIds?: string[];
  status?: QualityInboundCaseStatus;
  caseType?: QualityInboundCaseType;
}
