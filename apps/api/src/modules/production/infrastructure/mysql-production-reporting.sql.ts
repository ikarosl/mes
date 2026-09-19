/** 末道工序的有效正常报工量；只读报工事实，不代表质检或批准产出。 */
export const lastStepReportedQuantitySql = (batchId: string, lock = false): string => {
  const share = lock ? ' FOR SHARE' : '';
  return `COALESCE((SELECT SUM(CASE WHEN report.report_type='normal'
    THEN report.normal_quantity ELSE -report.normal_quantity END)
    FROM batch_step_reports report WHERE report.batch_step_record_id=(
      SELECT step.id FROM batch_step_records step WHERE step.production_batch_id=${batchId}
      ORDER BY step.step_order_snapshot DESC,step.id DESC LIMIT 1${share}
    )${share}),0)`;
};
