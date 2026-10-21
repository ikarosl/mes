import type { RowDataPacket } from 'mysql2/promise';
import type {
  ProcessInspectionRecord,
  ProcessInspectionStepIdentity,
  ProcessInspectionEntry,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
export type ProcessInspectionRootRow = RowDataPacket & {
  id: string;
  production_batch_id: string;
  batch_step_record_id: string;
  current_record_id: string | null;
  accepted_quantity: number;
  version: number;
  created_at: Date;
  updated_at: Date;
};
export type ProcessInspectionRecordRow = RowDataPacket & {
  id: string;
  inspection_id: string;
  record_type: ProcessInspectionRecord['recordType'];
  inspection_method: ProcessInspectionRecord['inspectionMethod'];
  qualified_quantity: number;
  unqualified_quantity: number;
  scope_note: string;
  inspected_at: Date;
  result_note: string;
  evidence_reference: string;
  reversal_of_record_id: string | null;
  replaces_record_id: string | null;
  reason: string | null;
  created_by: string;
  created_at: Date;
};
export type ProcessInspectionStepRow = RowDataPacket & {
  batch_id: string;
  batch_no: string;
  batch_status: string;
  step_status: string;
  pending_approval_id: string | null;
  work_order_id: string;
  work_order_no: string;
  step_id: string;
  step_order_snapshot: number;
  step_code_snapshot: string;
  step_name_snapshot: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  unit_snapshot: string;
};
export function mapProcessInspectionRecord(
  row: ProcessInspectionRecordRow,
): ProcessInspectionRecord {
  return {
    id: String(row.id),
    inspectionId: String(row.inspection_id),
    recordType: row.record_type,
    inspectionMethod: row.inspection_method,
    qualifiedQuantity: Number(row.qualified_quantity),
    unqualifiedQuantity: Number(row.unqualified_quantity),
    inspectedQuantity: Number(row.qualified_quantity) + Number(row.unqualified_quantity),
    scopeNote: row.scope_note,
    inspectedAt: toBeijingISOString(row.inspected_at)!,
    resultNote: row.result_note,
    evidenceReference: row.evidence_reference,
    reversalOfRecordId:
      row.reversal_of_record_id === null ? null : String(row.reversal_of_record_id),
    replacesRecordId: row.replaces_record_id === null ? null : String(row.replaces_record_id),
    reason: row.reason,
    createdBy: String(row.created_by),
    createdByName: '',
    createdAt: toBeijingISOString(row.created_at)!,
  };
}
export function mapProcessInspectionStep(
  row: ProcessInspectionStepRow,
): ProcessInspectionStepIdentity {
  return {
    batchId: String(row.batch_id),
    batchNo: row.batch_no,
    workOrderId: String(row.work_order_id),
    workOrderNo: row.work_order_no,
    stepId: String(row.step_id),
    stepOrder: row.step_order_snapshot,
    stepCode: row.step_code_snapshot,
    stepName: row.step_name_snapshot,
    productCode: row.product_code_snapshot,
    productName: row.product_name_snapshot,
    unit: row.unit_snapshot,
  };
}
export function mapProcessInspectionEntry(
  root: ProcessInspectionRootRow,
  source: ProcessInspectionStepIdentity,
  currentRecord: ProcessInspectionRecord | null,
  acceptBlockedReason: string | null,
): ProcessInspectionEntry {
  const acceptedQuantity = Number(root.accepted_quantity);
  return {
    ...source,
    id: String(root.id),
    status: currentRecord ? 'active' : 'reversed',
    currentRecord,
    acceptedQuantity,
    pendingQuantity: (currentRecord?.unqualifiedQuantity ?? 0) - acceptedQuantity,
    canAccept: acceptBlockedReason === null,
    acceptBlockedReason,
    version: root.version,
    createdAt: toBeijingISOString(root.created_at)!,
    updatedAt: toBeijingISOString(root.updated_at)!,
  };
}
export const PROCESS_INSPECTION_ROOT_COLUMNS =
  'id,production_batch_id,batch_step_record_id,current_record_id,accepted_quantity,version,created_at,updated_at';
export const PROCESS_INSPECTION_RECORD_COLUMNS =
  'id,inspection_id,record_type,inspection_method,qualified_quantity,unqualified_quantity,scope_note,inspected_at,result_note,evidence_reference,reversal_of_record_id,replaces_record_id,reason,created_by,created_at';
