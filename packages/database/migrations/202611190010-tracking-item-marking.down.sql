-- Stop the same writers. Downgrade requires empty marking and association tables.
CREATE TEMPORARY TABLE tmp_tracking_item_mark_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_item_mark_down_empty CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_item_mark_down_guard
SELECT 1 WHERE EXISTS(SELECT 1 FROM production_tracking_item_mark)
 OR EXISTS(SELECT 1 FROM production_tracking_item_mark_correction)
 OR EXISTS(SELECT 1 FROM production_tracking_item_mark_cancellation)
 OR EXISTS(SELECT 1 FROM production_tracking_item_mark_scrap)
 OR EXISTS(SELECT 1 FROM production_tracking_output_item_mark);
DROP TEMPORARY TABLE tmp_tracking_item_mark_down_guard;

DROP TABLE production_tracking_output_item_mark;
DROP TABLE production_tracking_item_mark_scrap;
DROP TABLE production_tracking_item_mark_cancellation;
DROP TABLE production_tracking_item_mark_correction;
DROP TABLE production_tracking_item_mark;
