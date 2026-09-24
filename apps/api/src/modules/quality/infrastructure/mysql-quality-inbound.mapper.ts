import type { QualityInboundCaseItem, QualityInboundInspectionItem } from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../common/time/date-time.js';

export type CaseRow = RowDataPacket & {
  id: string;
  receipt_line_id: string;
  receipt_revision_id: string;
  incoming_round_id: string;
  case_type: QualityInboundCaseItem['caseType'];
  status: QualityInboundCaseItem['status'];
  declared_quantity: number;
  reason: string;
  version: number;
  completed_by: string | null;
  completed_at: Date | null;
  superseded_by_round_id: string | null;
  superseded_reason: string | null;
  created_by: string;
  created_at: Date;
};
export type InspectionRow = RowDataPacket & {
  id: string;
  case_id: string;
  receipt_line_id: string;
  receipt_revision_id: string;
  covered_quantity: null;
  inspection_method: QualityInboundInspectionItem['inspectionMethod'];
  qualified_quantity: number;
  unqualified_quantity: number;
  release_decision: QualityInboundInspectionItem['releaseDecision'];
  previous_record_id: string | null;
  inspected_at: Date;
  result_note: string;
  evidence_reference: string;
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
    coveredQuantity: null,
    inspectionMethod: row.inspection_method,
    qualifiedQuantity: String(row.qualified_quantity),
    unqualifiedQuantity: String(row.unqualified_quantity),
    inspectedQuantity: String(Number(row.qualified_quantity) + Number(row.unqualified_quantity)),
    releasedQuantity: null,
    releaseDecision: row.release_decision,
    previousRecordId: nullable(row.previous_record_id),
    inspectedAt: toBeijingISOString(row.inspected_at),
    remark: row.result_note,
    evidence: row.evidence_reference,
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
    roundId: String(row.incoming_round_id),
    caseType: row.case_type,
    status: row.status,
    coveredQuantity: String(row.declared_quantity),
    reason: row.reason,
    version: row.version,
    completedBy: nullable(row.completed_by),
    completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
    supersededByRoundId: nullable(row.superseded_by_round_id),
    supersededReason: row.superseded_reason,
    createdBy: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
    inspection,
  };
}
