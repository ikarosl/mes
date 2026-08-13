CREATE TEMPORARY TABLE production_supplement_reopen_candidates (
  batch_step_record_id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE = MEMORY;

INSERT INTO production_supplement_reopen_candidates (batch_step_record_id)
SELECT target_step.id
FROM batch_step_records target_step
JOIN production_batches batch ON batch.id = target_step.production_batch_id
WHERE target_step.status = 'completed'
  AND EXISTS (
    SELECT 1
    FROM production_material_supplement supplement
    JOIN batch_step_scrap_records scrap ON scrap.id = supplement.scrap_record_id
    JOIN batch_step_records source_step ON source_step.id = scrap.batch_step_record_id
    WHERE supplement.production_batch_id = target_step.production_batch_id
      AND supplement.status = 'activated'
      AND source_step.step_order_snapshot >= target_step.step_order_snapshot
  )
  AND (
    target_step.need_record_snapshot = 0
    OR COALESCE(
      (
        SELECT SUM(
          CASE
            WHEN report.report_type = 'normal' THEN report.normal_quantity
            ELSE -report.normal_quantity
          END
        )
        FROM batch_step_reports report
        WHERE report.batch_step_record_id = target_step.id
      ),
      0
    ) < (
      batch.planned_quantity
      + COALESCE(
        (
          SELECT SUM(downstream_scrap.scrap_quantity)
          FROM production_material_supplement downstream_supplement
          JOIN batch_step_scrap_records downstream_scrap
            ON downstream_scrap.id = downstream_supplement.scrap_record_id
          JOIN batch_step_records downstream_source_step
            ON downstream_source_step.id = downstream_scrap.batch_step_record_id
          WHERE downstream_supplement.production_batch_id = target_step.production_batch_id
            AND downstream_supplement.status = 'activated'
            AND downstream_source_step.step_order_snapshot > target_step.step_order_snapshot
        ),
        0
      )
    )
  );

UPDATE batch_step_records target_step
JOIN production_supplement_reopen_candidates candidate
  ON candidate.batch_step_record_id = target_step.id
SET
  target_step.status = 'doing',
  target_step.completed_at = NULL,
  target_step.version = target_step.version + 1;

DROP TEMPORARY TABLE production_supplement_reopen_candidates;
