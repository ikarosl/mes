-- Stop Product writers and attachment cleanup. Never discard files to recover scalar storage.
CREATE TEMPORARY TABLE tmp_specification_json_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_specification_json_rollback CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_specification_json_guard
SELECT 1 WHERE EXISTS (
 SELECT 1 FROM products WHERE NOT JSON_SCHEMA_VALID(
  '{"type":"array","maxItems":1,"items":{"type":"string","pattern":"^[1-9][0-9]{0,19}$"}}',specification_file_ids)
) OR EXISTS (
 SELECT 1 FROM material_variants WHERE NOT JSON_SCHEMA_VALID(
  '{"type":"array","maxItems":1,"items":{"type":"string","pattern":"^[1-9][0-9]{0,19}$"}}',specification_file_ids)
);
INSERT INTO tmp_specification_json_guard
SELECT 1 WHERE EXISTS (
 SELECT 1 FROM products p LEFT JOIN attachments a ON CAST(a.id AS CHAR)=JSON_UNQUOTE(JSON_EXTRACT(p.specification_file_ids,'$[0]'))
 WHERE JSON_LENGTH(p.specification_file_ids)=1 AND (a.id IS NULL OR a.file_type<>'specification'
  OR NOT EXISTS (SELECT 1 FROM attachment_references r WHERE r.owner_type='product' AND r.owner_id=p.id AND r.slot='specification' AND r.attachment_id=a.id))
) OR EXISTS (
 SELECT 1 FROM material_variants v LEFT JOIN attachments a ON CAST(a.id AS CHAR)=JSON_UNQUOTE(JSON_EXTRACT(v.specification_file_ids,'$[0]'))
 WHERE JSON_LENGTH(v.specification_file_ids)=1 AND (a.id IS NULL OR a.file_type<>'specification'
  OR NOT EXISTS (SELECT 1 FROM attachment_references r WHERE r.owner_type='material_variant' AND r.owner_id=v.id AND r.slot='specification' AND r.attachment_id=a.id))
) OR EXISTS (
 SELECT 1 FROM attachment_references r LEFT JOIN products p ON p.id=r.owner_id
 WHERE r.owner_type='product' AND r.slot='specification'
  AND (p.id IS NULL OR NOT JSON_CONTAINS(p.specification_file_ids,JSON_QUOTE(CAST(r.attachment_id AS CHAR))))
) OR EXISTS (
 SELECT 1 FROM attachment_references r LEFT JOIN material_variants v ON v.id=r.owner_id
 WHERE r.owner_type='material_variant' AND r.slot='specification'
  AND (v.id IS NULL OR NOT JSON_CONTAINS(v.specification_file_ids,JSON_QUOTE(CAST(r.attachment_id AS CHAR))))
);

ALTER TABLE products ADD COLUMN specification_file_id BIGINT UNSIGNED NULL,
 ADD INDEX idx_products_specification_file (specification_file_id),
 ADD CONSTRAINT fk_products_specification_file FOREIGN KEY (specification_file_id) REFERENCES attachments(id) ON DELETE RESTRICT;
ALTER TABLE material_variants ADD COLUMN specification_file_id BIGINT UNSIGNED NULL,
 ADD INDEX idx_material_variants_specification_file (specification_file_id),
 ADD CONSTRAINT fk_material_variants_specification_file FOREIGN KEY (specification_file_id) REFERENCES attachments(id) ON DELETE RESTRICT;
UPDATE products SET specification_file_id=CAST(JSON_UNQUOTE(JSON_EXTRACT(specification_file_ids,'$[0]')) AS UNSIGNED),updated_at=updated_at
 WHERE JSON_LENGTH(specification_file_ids)=1;
UPDATE material_variants SET specification_file_id=CAST(JSON_UNQUOTE(JSON_EXTRACT(specification_file_ids,'$[0]')) AS UNSIGNED),updated_at=updated_at
 WHERE JSON_LENGTH(specification_file_ids)=1;
INSERT INTO tmp_specification_json_guard
SELECT 1 WHERE EXISTS (
 SELECT 1 FROM products WHERE specification_file_ids<>
  CASE WHEN specification_file_id IS NULL THEN JSON_ARRAY() ELSE JSON_ARRAY(CAST(specification_file_id AS CHAR)) END
) OR EXISTS (
 SELECT 1 FROM material_variants WHERE specification_file_ids<>
  CASE WHEN specification_file_id IS NULL THEN JSON_ARRAY() ELSE JSON_ARRAY(CAST(specification_file_id AS CHAR)) END
);

ALTER TABLE products DROP CHECK chk_products_specification_file_ids,DROP COLUMN specification_file_ids;
ALTER TABLE material_variants DROP CHECK chk_material_variants_specification_file_ids,DROP COLUMN specification_file_ids;
DROP TEMPORARY TABLE tmp_specification_json_guard;
