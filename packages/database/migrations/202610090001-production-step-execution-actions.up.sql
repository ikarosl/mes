-- Demand-correction evidence/result shapes changed; do not invent historical reopens.
CREATE TEMPORARY TABLE guard_step_actions_up (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_step_actions_up SELECT IF(EXISTS (SELECT 1 FROM production_demand_correction),0,1);
DROP TEMPORARY TABLE guard_step_actions_up;

CREATE TABLE batch_step_execution_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  batch_step_record_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  correction_type VARCHAR(30) NULL,
  before_status VARCHAR(30) NOT NULL,
  after_status VARCHAR(30) NOT NULL,
  before_started_at DATETIME NULL,
  after_started_at DATETIME NULL,
  before_completed_at DATETIME NULL,
  after_completed_at DATETIME NULL,
  reason VARCHAR(1000) NULL,
  step_version INT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_step_execution_action_version (batch_step_record_id,step_version),
  KEY idx_step_execution_action_history (batch_step_record_id,created_at,id),
  KEY idx_step_execution_action_batch (production_batch_id,created_at,id),
  CONSTRAINT fk_step_execution_action_source FOREIGN KEY (batch_step_record_id,production_batch_id)
    REFERENCES batch_step_records(id,production_batch_id),
  CONSTRAINT fk_step_execution_action_actor FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_step_execution_action_type CHECK (action_type IN ('start','complete','reopen','correct_history')),
  CONSTRAINT chk_step_execution_action_status CHECK (
    before_status IN ('pending','assigned','doing','completed','terminated')
    AND after_status IN ('pending','assigned','doing','completed','terminated')
  ),
  CONSTRAINT chk_step_execution_action_version CHECK (step_version>0),
  CONSTRAINT chk_step_execution_action_reason CHECK (
    (action_type IN ('start','complete') AND reason IS NULL)
    OR (action_type IN ('reopen','correct_history') AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason))>0)
  ),
  CONSTRAINT chk_step_execution_action_correction CHECK (
    (action_type<>'correct_history' AND correction_type IS NULL)
    OR (action_type='correct_history' AND correction_type IS NOT NULL AND correction_type IN ('undo_start','complete','reopen'))
  ),
  CONSTRAINT chk_step_execution_action_times CHECK (
    (before_completed_at IS NULL OR (before_started_at IS NOT NULL AND before_completed_at>=before_started_at))
    AND (after_completed_at IS NULL OR (after_started_at IS NOT NULL AND after_completed_at>=after_started_at))
  ),
  CONSTRAINT chk_step_execution_action_transition CHECK (
    (action_type='start' AND before_status='assigned' AND after_status='doing'
      AND before_started_at IS NULL AND after_started_at IS NOT NULL AND after_completed_at IS NULL)
    OR ((action_type='complete' OR (action_type='correct_history' AND correction_type='complete'))
      AND before_status='doing' AND after_status='completed' AND before_started_at IS NOT NULL
      AND after_started_at IS NOT NULL AND after_started_at=before_started_at AND after_completed_at IS NOT NULL)
    OR ((action_type='reopen' OR (action_type='correct_history' AND correction_type='reopen'))
      AND before_status='completed' AND after_status='doing' AND before_started_at IS NOT NULL
      AND after_started_at IS NOT NULL AND after_started_at=before_started_at AND after_completed_at IS NULL)
    OR (action_type='correct_history' AND correction_type='undo_start'
      AND before_status IN ('doing','completed') AND before_started_at IS NOT NULL
      AND after_status='assigned' AND after_started_at IS NULL AND after_completed_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_step_execution_action_no_update BEFORE UPDATE ON batch_step_execution_actions
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production execution actions are immutable';
CREATE TRIGGER trg_step_execution_action_no_delete BEFORE DELETE ON batch_step_execution_actions
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production execution actions are immutable';

UPDATE permissions SET name='员工工序开始、完成与重开',
  api_method='POST',api_path='/api/production/batches/:batchId/step-records/:recordId/actions/*'
WHERE code='production:steps:start';
