/** Read-only presentation evidence for the inspection's original round. */
export const finishedInspectionSelect = `SELECT r.id,r.closeout_id,r.production_batch_id,
 c.finished_round_id,c.declared_version,c.declared_available_quantity,c.declared_extra_quantity,c.declared_scrap_quantity,
 round.baseline_planned_received,round.baseline_extra_received,
 r.inspection_method,r.covered_quantity,(r.qualified_quantity+r.unqualified_quantity) inspected_quantity,
 r.unqualified_quantity,r.release_decision,r.inspected_at,r.result_note,r.evidence_reference,
 r.previous_record_id previous_inspection_id,r.created_by,r.created_at
 FROM quality_inspection_record r JOIN quality_inspection_case c ON c.id=r.case_id
 JOIN production_output_round round ON round.id=c.finished_round_id`;
