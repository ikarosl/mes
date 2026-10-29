-- Stop Product and BOM approval writes before rolling back the matching API.
-- Arbitrary tables cannot be flattened to legacy key/value/unit rows losslessly.
-- Reject before permanent DDL or changing any mutable master-data values.
CREATE TEMPORARY TABLE tmp_product_json_table_specifications_down_guard (
  bom_history TINYINT NOT NULL DEFAULT 0,
  unrepresentable_specs TINYINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_product_specs_rollback_bom_history CHECK (bom_history = 0),
  CONSTRAINT chk_product_specs_rollback_table_shape CHECK (unrepresentable_specs = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_product_json_table_specifications_down_guard (bom_history)
SELECT 1 WHERE EXISTS (
  SELECT 1 FROM approval_instances
  WHERE scene_code = 'product.bom.approve' OR subject_type = 'product'
);

SET @product_legacy_spec_columns = JSON_ARRAY(
  JSON_OBJECT('key', 'key', 'label', '参数名称'),
  JSON_OBJECT('key', 'value', 'label', '参数值'),
  JSON_OBJECT('key', 'unit', 'label', '单位')
);
SET @product_legacy_spec_rows_schema = '{
  "type": "array",
  "maxItems": 200,
  "items": {
    "type": "object",
    "required": ["key", "value", "unit"],
    "additionalProperties": false,
    "properties": {
      "key": { "type": "string", "maxLength": 100 },
      "value": { "type": "string", "maxLength": 255 },
      "unit": { "type": "string", "maxLength": 20 }
    }
  }
}';

INSERT INTO tmp_product_json_table_specifications_down_guard (unrepresentable_specs)
SELECT 1 FROM (
  SELECT spec_values FROM products
  UNION ALL
  SELECT spec_values FROM materials
) current_specs
WHERE NOT (
  current_specs.spec_values = JSON_OBJECT('columns', JSON_ARRAY(), 'rows', JSON_ARRAY())
  OR (
    JSON_EXTRACT(current_specs.spec_values, '$.columns') = CAST(@product_legacy_spec_columns AS JSON)
    AND JSON_SCHEMA_VALID(
      @product_legacy_spec_rows_schema, JSON_EXTRACT(current_specs.spec_values, '$.rows')
    ) = 1
  )
)
LIMIT 1;

DROP TEMPORARY TABLE tmp_product_json_table_specifications_down_guard;

ALTER TABLE products
  DROP CHECK chk_products_spec_values_table,
  MODIFY COLUMN spec_values JSON NULL;

ALTER TABLE materials
  DROP CHECK chk_materials_spec_values_table,
  MODIFY COLUMN spec_values JSON NULL;

START TRANSACTION;

UPDATE products
SET spec_values = JSON_EXTRACT(spec_values, '$.rows'), updated_at = updated_at;

UPDATE materials
SET spec_values = JSON_EXTRACT(spec_values, '$.rows'), updated_at = updated_at;

COMMIT;
