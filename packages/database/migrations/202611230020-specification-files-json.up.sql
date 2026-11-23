-- Stop Product writers and attachment cleanup; verify matching database/object backups first.
-- Convert persisted scalar IDs directly to JSON arrays, including inactive/deleted owners.
CREATE TEMPORARY TABLE tmp_specification_json_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_specification_json_conversion CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_specification_json_guard
SELECT 1 WHERE EXISTS (
 SELECT 1 FROM products p LEFT JOIN attachments a ON a.id=p.specification_file_id
 WHERE p.specification_file_id IS NOT NULL AND (a.id IS NULL OR a.file_type<>'specification'
  OR NOT EXISTS (SELECT 1 FROM attachment_references r WHERE r.owner_type='product' AND r.owner_id=p.id AND r.slot='specification' AND r.attachment_id=p.specification_file_id))
) OR EXISTS (
 SELECT 1 FROM material_variants v LEFT JOIN attachments a ON a.id=v.specification_file_id
 WHERE v.specification_file_id IS NOT NULL AND (a.id IS NULL OR a.file_type<>'specification'
  OR NOT EXISTS (SELECT 1 FROM attachment_references r WHERE r.owner_type='material_variant' AND r.owner_id=v.id AND r.slot='specification' AND r.attachment_id=v.specification_file_id))
) OR EXISTS (
 SELECT 1 FROM attachment_references r LEFT JOIN products p ON p.id=r.owner_id
 WHERE r.owner_type='product' AND r.slot='specification' AND NOT (r.attachment_id <=> p.specification_file_id)
) OR EXISTS (
 SELECT 1 FROM attachment_references r LEFT JOIN material_variants v ON v.id=r.owner_id
 WHERE r.owner_type='material_variant' AND r.slot='specification' AND NOT (r.attachment_id <=> v.specification_file_id)
);

ALTER TABLE products
 ADD COLUMN specification_file_ids JSON NOT NULL DEFAULT (JSON_ARRAY()),
 ADD CONSTRAINT chk_products_specification_file_ids CHECK (JSON_SCHEMA_VALID(
  '{"type":"array","maxItems":5,"uniqueItems":true,"items":{"type":"string","pattern":"^[1-9][0-9]{0,19}$"}}',
  specification_file_ids));
ALTER TABLE material_variants
 ADD COLUMN specification_file_ids JSON NOT NULL DEFAULT (JSON_ARRAY()),
 ADD CONSTRAINT chk_material_variants_specification_file_ids CHECK (JSON_SCHEMA_VALID(
  '{"type":"array","maxItems":5,"uniqueItems":true,"items":{"type":"string","pattern":"^[1-9][0-9]{0,19}$"}}',
  specification_file_ids));

-- Preserve BIGINT precision and master-data audit/version values. NULL remains an empty array.
UPDATE products SET specification_file_ids=JSON_ARRAY(CAST(specification_file_id AS CHAR)),updated_at=updated_at
 WHERE specification_file_id IS NOT NULL;
UPDATE material_variants SET specification_file_ids=JSON_ARRAY(CAST(specification_file_id AS CHAR)),updated_at=updated_at
 WHERE specification_file_id IS NOT NULL;
INSERT INTO tmp_specification_json_guard
SELECT 1 WHERE EXISTS (
 SELECT 1 FROM products WHERE specification_file_ids<>
  CASE WHEN specification_file_id IS NULL THEN JSON_ARRAY() ELSE JSON_ARRAY(CAST(specification_file_id AS CHAR)) END
) OR EXISTS (
 SELECT 1 FROM material_variants WHERE specification_file_ids<>
  CASE WHEN specification_file_id IS NULL THEN JSON_ARRAY() ELSE JSON_ARRAY(CAST(specification_file_id AS CHAR)) END
);

ALTER TABLE products DROP FOREIGN KEY fk_products_specification_file,
 DROP INDEX idx_products_specification_file,DROP COLUMN specification_file_id;
ALTER TABLE material_variants DROP FOREIGN KEY fk_material_variants_specification_file,
 DROP INDEX idx_material_variants_specification_file,DROP COLUMN specification_file_id;
DROP TEMPORARY TABLE tmp_specification_json_guard;
