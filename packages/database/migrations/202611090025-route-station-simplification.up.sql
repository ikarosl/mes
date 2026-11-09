ALTER TABLE process_route_steps
  DROP FOREIGN KEY fk_process_route_steps_owner,
  DROP INDEX fk_process_route_steps_owner,
  DROP CHECK chk_process_route_steps_flags,
  DROP COLUMN default_owner_id,
  DROP COLUMN need_inspection,
  ADD CONSTRAINT chk_process_route_steps_flags CHECK(status IN (0,1) AND is_deleted IN (0,1));
