-- Rollback requires reset: removing the counter while work orders remain could reuse numbers.
CREATE TEMPORARY TABLE guard_work_order_auto_number_empty (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_work_order_auto_number_empty SELECT IF(EXISTS (SELECT 1 FROM work_orders),0,1);
DROP TEMPORARY TABLE guard_work_order_auto_number_empty;

DROP TRIGGER trg_work_orders_reject_number_update;
DROP TABLE work_order_daily_sequence;
