DELETE reversal
FROM batch_step_reports reversal
JOIN batch_step_abnormal_dispositions disposition
  ON reversal.report_no = CONCAT('LEGACY-REJECT-REV-', disposition.id)
 AND reversal.reversal_of_report_id = disposition.batch_step_report_id
WHERE disposition.review_status = 'rejected'
  AND reversal.report_type = 'reversal';
