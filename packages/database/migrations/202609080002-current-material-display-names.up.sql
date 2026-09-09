-- Deploy with the matching API and inventory writers stopped. MySQL DDL is not transactional.
-- Material identity, version, code, unit and quantity facts remain unchanged.
ALTER TABLE production_material_requirement_basis DROP COLUMN material_name_snapshot;
ALTER TABLE production_item_demand DROP COLUMN item_name_snapshot;
ALTER TABLE item_batch DROP COLUMN product_name_snapshot;
ALTER TABLE inbound_detail DROP COLUMN product_name_snapshot;
