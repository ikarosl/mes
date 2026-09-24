import type { RowDataPacket } from 'mysql2/promise';
import type { ProductionOutputInspection } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { evaluateOutputInspection } from '../domain/finished-inspection.policy.js';
export type InspectionRow = RowDataPacket & {
  id: number;
  closeout_id: number;
  production_batch_id: number;
  declared_version: number;
  declared_available_quantity: string;
  declared_extra_quantity: string;
  declared_scrap_quantity: string;
  inspection_method: ProductionOutputInspection['inspectionMethod'];
  covered_quantity: string;
  inspected_quantity: string;
  unqualified_quantity: string;
  release_decision: ProductionOutputInspection['releaseDecision'];
  inspected_at: Date;
  result_note: string;
  evidence_reference: string;
  previous_inspection_id: number | null;
  created_by: number;
  created_at: Date;
};
export function mapFinishedInspection(row: InspectionRow): ProductionOutputInspection {
  const facts = {
    inspectionMethod: row.inspection_method,
    coveredQuantity: Number(row.covered_quantity),
    inspectedQuantity: Number(row.inspected_quantity),
    unqualifiedQuantity: Number(row.unqualified_quantity),
    releaseDecision: row.release_decision,
  };
  return {
    id: String(row.id),
    closeoutId: String(row.closeout_id),
    batchId: String(row.production_batch_id),
    declaredVersion: row.declared_version,
    declared: {
      availableQuantity: Number(row.declared_available_quantity),
      extraQuantity: Number(row.declared_extra_quantity),
      additionalScrapQuantity: Number(row.declared_scrap_quantity),
    },
    ...facts,
    ...evaluateOutputInspection(facts),
    inspectedAt: toBeijingISOString(row.inspected_at),
    resultNote: row.result_note,
    evidenceReference: row.evidence_reference,
    previousInspectionId:
      row.previous_inspection_id === null ? null : String(row.previous_inspection_id),
    createdBy: String(row.created_by),
    createdByName: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
  };
}
