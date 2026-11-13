-- Stop Production task, demand and tracking writers and their related command executors.
-- Take a verified backup with its matching application before changing the write contract.
-- Existing task states, route/step snapshots, audits and idempotency results stay unchanged.
-- Keep the legacy pending default: the new application explicitly creates draft tasks.
-- Route/step freezing occurs once in the application's draft-to-pending release transaction;
-- the existing lifecycle guard already requires every state change to advance version once.
ALTER TABLE production_batches
 DROP CHECK chk_production_batches_status,
 ADD CONSTRAINT chk_production_batches_status CHECK(status IN (
  'draft','pending','material_pending','material_assigned','material_partially_outbound',
  'material_outbound','doing','completed','cancelled'
 ));
