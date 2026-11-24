-- Stop tracking and output writers. An original settlement retains its mode after adjustment.
CREATE TEMPORARY TABLE tmp_tracking_optional_scrap_mode_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_tracking_optional_scrap_mode_down_guard CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_tracking_optional_scrap_mode_down_guard
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM production_tracking_abnormality_handling WHERE scrap_mode='optional_marks'
);
DROP TEMPORARY TABLE tmp_tracking_optional_scrap_mode_down_guard;

ALTER TABLE production_tracking_abnormality_handling
 DROP CHECK chk_tracking_handling_scrap_mode,
 ADD CONSTRAINT chk_tracking_handling_scrap_mode CHECK(scrap_mode IN ('quantity_only','item_marked'));
