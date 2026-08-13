CREATE TEMPORARY TABLE tmp_production_design_alignment_guard (
  invalid_value TINYINT NOT NULL,
  CONSTRAINT chk_tmp_production_design_alignment_guard CHECK (invalid_value = 0)
);

INSERT INTO tmp_production_design_alignment_guard (invalid_value)
SELECT 1
FROM batch_step_records
WHERE status = 'abnormal'
LIMIT 1;

INSERT INTO tmp_production_design_alignment_guard (invalid_value)
SELECT 1
FROM production_item_demand
WHERE demand_type NOT IN (0, 1)
LIMIT 1;

DROP TEMPORARY TABLE tmp_production_design_alignment_guard;

ALTER TABLE batch_step_records
  DROP CHECK chk_batch_step_records_status,
  ADD CONSTRAINT chk_batch_step_records_status
    CHECK (status IN ('pending', 'assigned', 'doing', 'completed'));

ALTER TABLE production_item_demand
  DROP CHECK chk_production_item_demand_source,
  DROP CHECK chk_production_item_demand_type,
  MODIFY COLUMN demand_type VARCHAR(30) NOT NULL DEFAULT 'normal';

UPDATE production_item_demand
SET demand_type = CASE demand_type
  WHEN '0' THEN 'normal'
  WHEN '1' THEN 'manual_additional'
END;

ALTER TABLE production_item_demand
  ADD CONSTRAINT chk_production_item_demand_type
    CHECK (demand_type IN ('normal', 'manual_additional')),
  ADD CONSTRAINT chk_production_item_demand_source
    CHECK (
      (demand_type = 'normal' AND parent_demand_id IS NULL AND source_scrap_id IS NULL)
      OR
      (
        demand_type = 'manual_additional'
        AND parent_demand_id IS NOT NULL
        AND source_scrap_id IS NULL
      )
    );

CREATE TABLE batch_step_abnormal_dispositions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  disposition_no VARCHAR(100) NOT NULL,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  batch_step_report_id BIGINT UNSIGNED NOT NULL,
  review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
  disposition_type VARCHAR(20) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  remark TEXT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_batch_step_abnormal_dispositions_no (disposition_no),
  UNIQUE KEY uk_batch_step_abnormal_dispositions_report (batch_step_report_id),
  KEY idx_batch_step_abnormal_dispositions_step_review (
    batch_step_record_id,
    review_status,
    created_at
  ),
  KEY idx_batch_step_abnormal_dispositions_batch_review (
    production_batch_id,
    review_status,
    created_at
  ),
  CONSTRAINT chk_batch_step_abnormal_dispositions_review_status CHECK (
    review_status IN ('pending_review', 'approved', 'rejected', 'cancelled')
  ),
  CONSTRAINT chk_batch_step_abnormal_dispositions_type CHECK (
    disposition_type IS NULL OR disposition_type IN ('rework', 'scrap')
  ),
  CONSTRAINT chk_batch_step_abnormal_dispositions_state CHECK (
    (
      review_status = 'pending_review'
      AND disposition_type IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    )
    OR
    (
      review_status = 'approved'
      AND disposition_type IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
    OR
    (
      review_status IN ('rejected', 'cancelled')
      AND disposition_type IS NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  ),
  CONSTRAINT chk_batch_step_abnormal_dispositions_version CHECK (version >= 0),
  CONSTRAINT fk_batch_step_abnormal_dispositions_report FOREIGN KEY (
    batch_step_report_id,
    batch_step_record_id,
    production_batch_id
  ) REFERENCES batch_step_reports(id, batch_step_record_id, production_batch_id),
  CONSTRAINT fk_batch_step_abnormal_dispositions_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users(id),
  CONSTRAINT fk_batch_step_abnormal_dispositions_created_by FOREIGN KEY (created_by)
    REFERENCES users(id),
  CONSTRAINT fk_batch_step_abnormal_dispositions_updated_by FOREIGN KEY (updated_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO batch_step_abnormal_dispositions (
  disposition_no,
  production_batch_id,
  batch_step_record_id,
  batch_step_report_id,
  review_status,
  remark,
  created_by,
  created_at,
  updated_by,
  updated_at
)
SELECT
  CONCAT('LEGACY-BSAD-', report.id),
  report.production_batch_id,
  report.batch_step_record_id,
  report.id,
  'pending_review',
  '由历史有效异常报工迁移生成，待管理员审批处置',
  report.created_by,
  report.created_at,
  report.created_by,
  report.created_at
FROM batch_step_reports report
WHERE report.report_type = 'normal'
  AND report.abnormal_quantity > 0
  AND NOT EXISTS (
    SELECT 1
    FROM batch_step_reports reversal
    WHERE reversal.reversal_of_report_id = report.id
  );
