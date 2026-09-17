ALTER TABLE work_orders
  ADD COLUMN previous_research_order_id BIGINT UNSIGNED NULL AFTER order_type,
  ADD KEY idx_work_orders_previous_research (previous_research_order_id,id),
  ADD CONSTRAINT fk_work_orders_previous_research FOREIGN KEY (previous_research_order_id) REFERENCES work_orders(id),
  ADD CONSTRAINT chk_work_orders_research_lineage_type CHECK (previous_research_order_id IS NULL OR order_type='research');

CREATE TRIGGER trg_work_orders_reject_self_research AFTER INSERT ON work_orders
FOR EACH ROW
BEGIN
  IF NEW.previous_research_order_id=NEW.id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Research work order cannot refer to itself';
  END IF;
END;

CREATE TRIGGER trg_work_orders_reject_research_lineage_update BEFORE UPDATE ON work_orders
FOR EACH ROW
BEGIN
  IF NOT (NEW.previous_research_order_id <=> OLD.previous_research_order_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Research predecessor is immutable';
  END IF;
END;
