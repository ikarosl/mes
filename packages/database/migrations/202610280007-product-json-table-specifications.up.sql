-- Stop Product master-data and BOM approval writes and deploy the matching API.
-- Approval evidence is immutable: old BOM snapshots require a development-db
-- rebuild through the versioned initialization entrypoint, not a JSON rewrite.
CREATE TEMPORARY TABLE tmp_product_json_table_specifications_up_guard (
  legacy_bom_history TINYINT NOT NULL DEFAULT 0,
  invalid_legacy_specs TINYINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_product_specs_rebuild_old_bom_history CHECK (legacy_bom_history = 0),
  CONSTRAINT chk_product_specs_legacy_values_convertible CHECK (invalid_legacy_specs = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_product_json_table_specifications_up_guard (legacy_bom_history)
SELECT 1 WHERE EXISTS (
  SELECT 1 FROM approval_instances
  WHERE (scene_code = 'product.bom.approve' OR subject_type = 'product')
    AND (
      snapshot_schema_version <> 3
      OR NOT (JSON_TYPE(JSON_EXTRACT(subject_snapshot, '$.specValues')) <=> 'OBJECT')
    )
);

-- Unknown fields and non-text values cannot be discarded or coerced silently.
-- SQL NULL, JSON null and missing legacy cells become the business empty value.
SET @product_legacy_spec_schema = '{
  "type": "array",
  "maxItems": 200,
  "items": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "key": { "type": ["string", "null"], "maxLength": 1000 },
      "value": { "type": ["string", "null"], "maxLength": 1000 },
      "unit": { "type": ["string", "null"], "maxLength": 1000 }
    }
  }
}';

INSERT INTO tmp_product_json_table_specifications_up_guard (invalid_legacy_specs)
SELECT 1 FROM (
  SELECT spec_values FROM products
  UNION ALL
  SELECT spec_values FROM materials
) legacy
WHERE legacy.spec_values IS NOT NULL
  AND JSON_TYPE(legacy.spec_values) <> 'NULL'
  AND JSON_SCHEMA_VALID(@product_legacy_spec_schema, legacy.spec_values) <> 1
LIMIT 1;

DROP TEMPORARY TABLE tmp_product_json_table_specifications_up_guard;

SET @product_legacy_spec_columns = JSON_ARRAY(
  JSON_OBJECT('key', 'key', 'label', '参数名称'),
  JSON_OBJECT('key', 'value', 'label', '参数值'),
  JSON_OBJECT('key', 'unit', 'label', '单位')
);

START TRANSACTION;

UPDATE products p
SET p.spec_values = JSON_OBJECT(
  'columns', IF(
    p.spec_values IS NULL OR JSON_TYPE(p.spec_values) = 'NULL',
    JSON_ARRAY(), CAST(@product_legacy_spec_columns AS JSON)
  ),
  'rows', COALESCE((
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'key', COALESCE(entry.spec_key, ''),
      'value', COALESCE(entry.spec_value, ''),
      'unit', COALESCE(entry.spec_unit, '')
    )) OVER (
      ORDER BY entry.row_no ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    )
    FROM JSON_TABLE(
      IF(JSON_TYPE(p.spec_values) = 'ARRAY', p.spec_values, JSON_ARRAY()),
      '$[*]' COLUMNS (
        row_no FOR ORDINALITY,
        spec_key VARCHAR(1000) PATH '$.key' NULL ON EMPTY ERROR ON ERROR,
        spec_value VARCHAR(1000) PATH '$.value' NULL ON EMPTY ERROR ON ERROR,
        spec_unit VARCHAR(1000) PATH '$.unit' NULL ON EMPTY ERROR ON ERROR
      )
    ) entry
    LIMIT 1
  ), JSON_ARRAY())
), p.updated_at = p.updated_at;

UPDATE materials m
SET m.spec_values = JSON_OBJECT(
  'columns', IF(
    m.spec_values IS NULL OR JSON_TYPE(m.spec_values) = 'NULL',
    JSON_ARRAY(), CAST(@product_legacy_spec_columns AS JSON)
  ),
  'rows', COALESCE((
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'key', COALESCE(entry.spec_key, ''),
      'value', COALESCE(entry.spec_value, ''),
      'unit', COALESCE(entry.spec_unit, '')
    )) OVER (
      ORDER BY entry.row_no ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    )
    FROM JSON_TABLE(
      IF(JSON_TYPE(m.spec_values) = 'ARRAY', m.spec_values, JSON_ARRAY()),
      '$[*]' COLUMNS (
        row_no FOR ORDINALITY,
        spec_key VARCHAR(1000) PATH '$.key' NULL ON EMPTY ERROR ON ERROR,
        spec_value VARCHAR(1000) PATH '$.value' NULL ON EMPTY ERROR ON ERROR,
        spec_unit VARCHAR(1000) PATH '$.unit' NULL ON EMPTY ERROR ON ERROR
      )
    ) entry
    LIMIT 1
  ), JSON_ARRAY())
), m.updated_at = m.updated_at;

COMMIT;

-- The application supplies the empty table; there is no database JSON default.
ALTER TABLE products
  MODIFY COLUMN spec_values JSON NOT NULL,
  ADD CONSTRAINT chk_products_spec_values_table CHECK (
    JSON_TYPE(spec_values) = 'OBJECT'
    AND JSON_LENGTH(spec_values) = 2
    AND JSON_CONTAINS_PATH(spec_values, 'all', '$.columns', '$.rows') = 1
    AND JSON_TYPE(JSON_EXTRACT(spec_values, '$.columns')) = 'ARRAY'
    AND JSON_TYPE(JSON_EXTRACT(spec_values, '$.rows')) = 'ARRAY'
  );

ALTER TABLE materials
  MODIFY COLUMN spec_values JSON NOT NULL,
  ADD CONSTRAINT chk_materials_spec_values_table CHECK (
    JSON_TYPE(spec_values) = 'OBJECT'
    AND JSON_LENGTH(spec_values) = 2
    AND JSON_CONTAINS_PATH(spec_values, 'all', '$.columns', '$.rows') = 1
    AND JSON_TYPE(JSON_EXTRACT(spec_values, '$.columns')) = 'ARRAY'
    AND JSON_TYPE(JSON_EXTRACT(spec_values, '$.rows')) = 'ARRAY'
  );
