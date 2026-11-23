-- Stop task, tracking, output and related inbound writers. Take a restore-verified
-- backup with the matching application. Existing outputs keep their original
-- quantity facts. New terminal confirmations follow the current marking policy.

CREATE TABLE production_tracking_item_mark (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 tracking_card_id BIGINT UNSIGNED NOT NULL,
 mark_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 occupied_mark_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
 version INT UNSIGNED NOT NULL DEFAULT 0,
 personnel_id BIGINT UNSIGNED NOT NULL,
 personnel_code_snapshot VARCHAR(100) NOT NULL,
 personnel_name_snapshot VARCHAR(100) NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 UNIQUE KEY uk_tracking_item_mark_occupied_code(occupied_mark_code),
 KEY idx_tracking_item_mark_card_order(tracking_card_id,created_at,id),
 KEY fk_tracking_item_mark_personnel(personnel_id),
 KEY fk_tracking_item_mark_actor(created_by),
 CONSTRAINT fk_tracking_item_mark_card FOREIGN KEY(tracking_card_id) REFERENCES production_tracking_card(id),
 CONSTRAINT fk_tracking_item_mark_personnel FOREIGN KEY(personnel_id) REFERENCES personnel(id),
 CONSTRAINT fk_tracking_item_mark_actor FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT chk_tracking_item_mark_occupied_code CHECK(occupied_mark_code IS NULL OR occupied_mark_code=mark_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_tracking_item_mark_correction (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 item_mark_id BIGINT UNSIGNED NOT NULL,
 previous_mark_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 corrected_mark_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reason TEXT NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 KEY idx_tracking_item_mark_correction_mark(item_mark_id,created_at,id),
 KEY fk_tracking_item_mark_correction_actor(created_by),
 CONSTRAINT fk_tracking_item_mark_correction_mark FOREIGN KEY(item_mark_id) REFERENCES production_tracking_item_mark(id),
 CONSTRAINT fk_tracking_item_mark_correction_actor FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_tracking_item_mark_cancellation (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 item_mark_id BIGINT UNSIGNED NOT NULL,
 reason TEXT NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 UNIQUE KEY uk_tracking_item_mark_cancellation(item_mark_id),
 KEY fk_tracking_item_mark_cancellation_actor(created_by),
 CONSTRAINT fk_tracking_item_mark_cancellation_mark FOREIGN KEY(item_mark_id) REFERENCES production_tracking_item_mark(id),
 CONSTRAINT fk_tracking_item_mark_cancellation_actor FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_tracking_item_mark_scrap (
 item_mark_id BIGINT UNSIGNED NOT NULL,
 handling_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 mark_code_snapshot VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
 PRIMARY KEY(item_mark_id,handling_id),
 KEY fk_tracking_item_mark_scrap_handling(handling_id),
 CONSTRAINT fk_tracking_item_mark_scrap_mark FOREIGN KEY(item_mark_id) REFERENCES production_tracking_item_mark(id),
 CONSTRAINT fk_tracking_item_mark_scrap_handling FOREIGN KEY(handling_id) REFERENCES production_tracking_abnormality_handling(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE production_tracking_output_item_mark (
 production_output_id BIGINT UNSIGNED NOT NULL,
 item_mark_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(production_output_id,item_mark_id),
 KEY fk_tracking_output_item_mark_mark(item_mark_id),
 CONSTRAINT fk_tracking_output_item_mark_output FOREIGN KEY(production_output_id) REFERENCES production_tracking_output(id),
 CONSTRAINT fk_tracking_output_item_mark_mark FOREIGN KEY(item_mark_id) REFERENCES production_tracking_item_mark(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The application validates mark eligibility, version changes, same-card scrap,
-- capacity and output completeness under the existing task and card locks.
