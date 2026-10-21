-- Do not discard real research history. Reset development data before rollback when used.
CREATE TEMPORARY TABLE guard_research_lineage_empty (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_research_lineage_empty SELECT IF(
  EXISTS (SELECT 1 FROM work_orders WHERE previous_research_order_id IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_research_lineage_empty;

DROP TRIGGER trg_work_orders_reject_research_lineage_update;
DROP TRIGGER trg_work_orders_reject_self_research;
ALTER TABLE work_orders
  DROP FOREIGN KEY fk_work_orders_previous_research,
  DROP CHECK chk_work_orders_research_lineage_type,
  DROP INDEX idx_work_orders_previous_research,
  DROP COLUMN previous_research_order_id;
