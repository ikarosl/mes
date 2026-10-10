CREATE TEMPORARY TABLE guard_step_actions_down (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_step_actions_down SELECT IF(
  EXISTS (SELECT 1 FROM batch_step_execution_actions)
  OR EXISTS (SELECT 1 FROM production_demand_correction),0,1);
DROP TEMPORARY TABLE guard_step_actions_down;

DROP TRIGGER trg_step_execution_action_no_delete;
DROP TRIGGER trg_step_execution_action_no_update;
DROP TABLE batch_step_execution_actions;

UPDATE permissions SET name='员工工序开工',
  api_method='POST',api_path='/api/production/batches/:batchId/step-records/:recordId/actions/start'
WHERE code='production:steps:start';
