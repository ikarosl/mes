import type { QualityInboundCaseItem, QualityInboundInspectionItem } from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../common/time/date-time.js';

export type CaseRow = RowDataPacket & {
  id: string;
  receipt_line_id: string;
  receipt_revision_id: string;
  source_scope_id: string | null;
  target_scope_id: string | null;
  case_type: QualityInboundCaseItem['caseType'];
  status: QualityInboundCaseItem['status'];
  covered_quantity: number;
  reason: string;
  version: number;
  completed_by: string | null;
  completed_at: Date | null;
  superseded_by_receipt_revision_id: string | null;
  created_by: string;
  created_at: Date;
};
export type InspectionRow = RowDataPacket & {
  id: string;
  case_id: string;
  receipt_line_id: string;
  receipt_revision_id: string;
  covered_quantity: number;
  inspection_method: QualityInboundInspectionItem['inspectionMethod'];
  qualified_quantity: number | null;
  unqualified_quantity: number | null;
  sample_quantity: number | null;
  sample_unqualified_quantity: number | null;
  removed_defect_quantity: number;
  inbound_approved: number;
  disposition: QualityInboundInspectionItem['disposition'];
  approved_quantity: number;
  quality_return_quantity: number;
  undetermined_quantity: number;
  remark: string;
  evidence: string;
  created_by: string;
  created_at: Date;
};
const nullable = (value: string | number | null): string | null =>
  value === null ? null : String(value);
export function mapInspection(row: InspectionRow): QualityInboundInspectionItem {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    receiptLineId: String(row.receipt_line_id),
    receiptRevisionId: String(row.receipt_revision_id),
    coveredQuantity: String(row.covered_quantity),
    inspectionMethod: row.inspection_method,
    qualifiedQuantity: nullable(row.qualified_quantity),
    unqualifiedQuantity: nullable(row.unqualified_quantity),
    sampleQuantity: nullable(row.sample_quantity),
    sampleUnqualifiedQuantity: nullable(row.sample_unqualified_quantity),
    removedDefectQuantity: String(row.removed_defect_quantity),
    inboundApproved: row.inbound_approved === 1,
    disposition: row.disposition,
    approvedQuantity: String(row.approved_quantity),
    qualityReturnQuantity: String(row.quality_return_quantity),
    undeterminedQuantity: String(row.undetermined_quantity),
    remark: row.remark,
    evidence: row.evidence,
    createdBy: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
  };
}
export function mapCase(
  row: CaseRow,
  inspection: QualityInboundInspectionItem | null = null,
): QualityInboundCaseItem {
  return {
    id: String(row.id),
    receiptLineId: String(row.receipt_line_id),
    receiptRevisionId: String(row.receipt_revision_id),
    sourceScopeId: nullable(row.source_scope_id),
    targetScopeId: nullable(row.target_scope_id),
    caseType: row.case_type,
    status: row.status,
    coveredQuantity: String(row.covered_quantity),
    reason: row.reason,
    version: row.version,
    completedBy: nullable(row.completed_by),
    completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
    supersededByReceiptRevisionId: nullable(row.superseded_by_receipt_revision_id),
    createdBy: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
    inspection,
  };
}
