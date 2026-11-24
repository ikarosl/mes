-- Stop tracking and output writers and take a restore-verified backup.
-- All existing settlement modes, including NULL, satisfy the expanded check.
ALTER TABLE production_tracking_abnormality_handling
 DROP CHECK chk_tracking_handling_scrap_mode,
 ADD CONSTRAINT chk_tracking_handling_scrap_mode CHECK(scrap_mode IN ('quantity_only','item_marked','optional_marks'));
