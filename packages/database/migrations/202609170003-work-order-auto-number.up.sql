-- Stop Production writers and reset development work orders before switching numbering rules.
-- No legacy number conversion and no reconstruction of a sequence from existing orders.
CREATE TEMPORARY TABLE guard_work_order_auto_number_empty (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_work_order_auto_number_empty SELECT IF(EXISTS (SELECT 1 FROM work_orders),0,1);
DROP TEMPORARY TABLE guard_work_order_auto_number_empty;

CREATE TABLE work_order_daily_sequence (
  number_date DATE NOT NULL COMMENT 'Beijing calendar day used for work order numbering',
  last_sequence BIGINT UNSIGNED NOT NULL COMMENT 'Last allocated sequence; never reduced on cancellation or closure',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (number_date),
  CONSTRAINT chk_work_order_daily_sequence_positive CHECK (last_sequence>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_work_orders_reject_number_update BEFORE UPDATE ON work_orders
FOR EACH ROW
BEGIN
  IF NOT (NEW.work_order_no <=> OLD.work_order_no) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Work order number is immutable';
  END IF;
END;
