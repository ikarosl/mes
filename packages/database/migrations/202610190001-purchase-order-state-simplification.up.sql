-- Old closure snapshots cannot be converted to manual follow-up semantics. Require an empty purchase chain.
CREATE TEMPORARY TABLE guard_purchase_order_state_simplification (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_purchase_order_state_simplification
SELECT IF(EXISTS(SELECT 1 FROM procurement_order)
  OR EXISTS(SELECT 1 FROM procurement_order_line_closure),0,1);
DROP TEMPORARY TABLE guard_purchase_order_state_simplification;

DROP TRIGGER trg_procurement_order_closure_no_update;
DROP TRIGGER trg_procurement_order_closure_no_delete;
DROP TABLE procurement_order_line_closure;
