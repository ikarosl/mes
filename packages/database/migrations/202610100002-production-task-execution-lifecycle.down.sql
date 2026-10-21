-- Roll back only an empty task/command store: lifecycle facts cannot become old short-batch evidence.
CREATE TEMPORARY TABLE guard_task_execution_lifecycle_down (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_task_execution_lifecycle_down SELECT IF(
  EXISTS (SELECT 1 FROM production_batches)
  OR EXISTS (SELECT 1 FROM http_idempotency_records),0,1);
DROP TEMPORARY TABLE guard_task_execution_lifecycle_down;

ALTER TABLE production_batch_closeout_action
  DROP CHECK chk_closeout_action_kind,
  ADD CONSTRAINT chk_closeout_action_kind CHECK (
    item_kind IN ('step','abnormal','rework','supplement','outbound','demand','allocation','material')
  );
ALTER TABLE production_batches
  DROP CHECK chk_production_batch_start_facts,
  DROP FOREIGN KEY fk_production_batch_started_by,
  DROP COLUMN start_material_snapshot,
  DROP COLUMN start_reason,
  DROP COLUMN started_by,
  ADD COLUMN material_plan_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER status,
  ADD CONSTRAINT chk_production_batches_material_plan_version CHECK (material_plan_version>0);

CREATE TABLE production_short_batch_authorization (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  production_batch_id BIGINT UNSIGNED NOT NULL,
  material_plan_version INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL,
  authorized_by BIGINT UNSIGNED NOT NULL,
  authorized_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_short_batch_authorization_batch_status (production_batch_id, status, authorized_at),
  CONSTRAINT chk_short_batch_authorization_plan_version CHECK (material_plan_version > 0),
  CONSTRAINT chk_short_batch_authorization_status CHECK (status IN ('active','superseded','consumed')),
  CONSTRAINT chk_short_batch_authorization_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0),
  CONSTRAINT chk_short_batch_authorization_version CHECK (version >= 0),
  CONSTRAINT fk_short_batch_authorization_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id),
  CONSTRAINT fk_short_batch_authorization_user FOREIGN KEY (authorized_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_short_batch_authorization_detail (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  authorization_id BIGINT UNSIGNED NOT NULL,
  demand_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  material_variant_id BIGINT UNSIGNED NOT NULL,
  demand_quantity_snapshot BIGINT NOT NULL,
  confirmed_outbound_quantity_snapshot BIGINT NOT NULL,
  expected_outbound_quantity_snapshot BIGINT NOT NULL,
  authorized_remaining_quantity BIGINT NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_short_batch_authorization_detail_demand (authorization_id, demand_id),
  KEY idx_short_batch_authorization_detail_demand (demand_id),
  CONSTRAINT chk_short_batch_authorization_detail_quantities CHECK (
    demand_quantity_snapshot > 0
    AND confirmed_outbound_quantity_snapshot >= 0
    AND expected_outbound_quantity_snapshot >= 0
    AND authorized_remaining_quantity >= 0
  ),
  CONSTRAINT fk_short_batch_authorization_detail_authorization FOREIGN KEY (authorization_id) REFERENCES production_short_batch_authorization(id),
  CONSTRAINT fk_short_batch_authorization_detail_demand_item FOREIGN KEY (demand_id, item_id) REFERENCES production_item_demand(id, item_id),
  CONSTRAINT fk_short_batch_authorization_detail_demand_variant FOREIGN KEY (demand_id,item_id,material_variant_id) REFERENCES production_item_demand(id,item_id,material_variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE outbound_order
  ADD COLUMN short_batch_authorization_id BIGINT UNSIGNED NULL AFTER work_order_id,
  ADD KEY idx_outbound_order_short_batch_authorization (short_batch_authorization_id),
  ADD CONSTRAINT fk_outbound_order_short_batch_authorization FOREIGN KEY (short_batch_authorization_id) REFERENCES production_short_batch_authorization(id);

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '授权短批开工', 'production:materials:authorize-short-batch', 'api', NULL, 'POST', '/api/production/batches/:batchId/actions/authorize-short-batch', 231, 1
FROM permissions WHERE code='production:view'
UNION ALL SELECT id, '关闭剩余物料需求', 'production:materials:close-remaining-demands', 'api', NULL, 'POST', '/api/production/batches/:batchId/actions/close-remaining-material-demands', 232, 1 FROM permissions WHERE code='production:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), name=VALUES(name), type=VALUES(type), route_path=VALUES(route_path), api_method=VALUES(api_method), api_path=VALUES(api_path), sort_order=VALUES(sort_order), status=1, deleted_at=NULL;
