-- Stop production tracking/task writers and Product route writers; take and restore-verify
-- a backup with the matching application. Preserve every original description verbatim.
-- A legacy description is one label: never infer a delimiter, trim text or invent a step.
CREATE TEMPORARY TABLE tmp_tracking_label_preflight (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_label_historical_identity CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_label_preflight
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM production_tracking_abnormality a
 LEFT JOIN batch_step_records s ON s.id=a.batch_step_record_id
 LEFT JOIN process_route_steps r ON r.id=s.route_step_id
 WHERE a.batch_step_record_id IS NOT NULL AND (s.id IS NULL OR r.process_step_id IS NULL)
);

CREATE TEMPORARY TABLE tmp_tracking_label_source (
 abnormality_id BIGINT UNSIGNED NOT NULL,
 process_step_id BIGINT UNSIGNED NULL,
 scope_key BIGINT UNSIGNED NOT NULL,
 label_hash BINARY(32) NOT NULL,
 label TEXT NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL,
 PRIMARY KEY(abnormality_id),
 KEY idx_tmp_tracking_label_hash(scope_key,label_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO tmp_tracking_label_source
 (abnormality_id,process_step_id,scope_key,label_hash,label,created_by,created_at)
SELECT a.id,r.process_step_id,COALESCE(r.process_step_id,0),
 UNHEX(SHA2(a.description,256)),a.description,a.created_by,a.created_at
FROM production_tracking_abnormality a
LEFT JOIN batch_step_records s ON s.id=a.batch_step_record_id
LEFT JOIN process_route_steps r ON r.id=s.route_step_id;
INSERT INTO tmp_tracking_label_preflight
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM tmp_tracking_label_source
 GROUP BY scope_key,label_hash HAVING COUNT(DISTINCT BINARY label)>1
);

CREATE TABLE production_tracking_abnormality_label (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 process_step_id BIGINT UNSIGNED NULL,
 scope_key BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(process_step_id,0)) STORED,
 label_hash BINARY(32) NOT NULL,
 label TEXT NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 UNIQUE KEY uk_tracking_label_scope_hash(scope_key,label_hash),
 KEY idx_tracking_label_scope_order(scope_key,id),
 KEY fk_tracking_label_step(process_step_id),
 KEY fk_tracking_label_actor(created_by),
 CONSTRAINT fk_tracking_label_step FOREIGN KEY(process_step_id) REFERENCES process_steps(id),
 CONSTRAINT fk_tracking_label_actor FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE production_tracking_abnormality_label_assignment (
 abnormality_id BIGINT UNSIGNED NOT NULL,
 label_id BIGINT UNSIGNED NOT NULL,
 label_order INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(abnormality_id,label_id),
 UNIQUE KEY uk_tracking_label_assignment_order(abnormality_id,label_order),
 KEY fk_tracking_label_assignment_label(label_id),
 CONSTRAINT fk_tracking_label_assignment_abnormality FOREIGN KEY(abnormality_id)
  REFERENCES production_tracking_abnormality(id),
 CONSTRAINT fk_tracking_label_assignment_label FOREIGN KEY(label_id)
  REFERENCES production_tracking_abnormality_label(id),
 CONSTRAINT chk_tracking_label_assignment_order CHECK(label_order BETWEEN 1 AND 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO production_tracking_abnormality_label
 (process_step_id,label_hash,label,created_by,created_at)
SELECT process_step_id,label_hash,label,created_by,created_at FROM (
 SELECT source_label.*,ROW_NUMBER() OVER(
  PARTITION BY scope_key,label_hash ORDER BY created_at,abnormality_id
 ) first_observation FROM tmp_tracking_label_source source_label
) observed WHERE first_observation=1 ORDER BY abnormality_id;
INSERT INTO production_tracking_abnormality_label_assignment
 (abnormality_id,label_id,label_order,created_at)
SELECT source_label.abnormality_id,label.id,1,source_label.created_at
FROM tmp_tracking_label_source source_label
JOIN production_tracking_abnormality_label label
 ON label.scope_key=source_label.scope_key AND label.label_hash=source_label.label_hash
 AND BINARY label.label=BINARY source_label.label;
INSERT INTO tmp_tracking_label_preflight
SELECT 1 WHERE (SELECT COUNT(*) FROM production_tracking_abnormality_label_assignment)
 <>(SELECT COUNT(*) FROM tmp_tracking_label_source);

-- Only widen the display snapshot; no existing value, status, quantity, handling,
-- card, output, audit or idempotency fact is rewritten.
ALTER TABLE production_tracking_abnormality MODIFY COLUMN description MEDIUMTEXT NOT NULL;

CREATE TRIGGER trg_tracking_label_hash_guard BEFORE INSERT ON production_tracking_abnormality_label
FOR EACH ROW BEGIN
 IF NEW.label_hash<>UNHEX(SHA2(NEW.label,256)) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking label hash must match its exact text';
 END IF;
END;
CREATE TRIGGER trg_tracking_label_no_update BEFORE UPDATE ON production_tracking_abnormality_label
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Observed tracking labels are immutable';
CREATE TRIGGER trg_tracking_label_no_delete BEFORE DELETE ON production_tracking_abnormality_label
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Observed tracking labels cannot be deleted';
CREATE TRIGGER trg_tracking_label_assignment_no_update BEFORE UPDATE ON production_tracking_abnormality_label_assignment
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking abnormality labels are immutable';
CREATE TRIGGER trg_tracking_label_assignment_no_delete BEFORE DELETE ON production_tracking_abnormality_label_assignment
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking abnormality labels cannot be deleted';

DROP TEMPORARY TABLE tmp_tracking_label_source;
DROP TEMPORARY TABLE tmp_tracking_label_preflight;
