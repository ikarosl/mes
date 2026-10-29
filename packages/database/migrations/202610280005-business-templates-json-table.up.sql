-- Stop template writes before converting the registered Product preset format.
-- Refuse data that cannot be represented without dropping fields or cell text.
CREATE TEMPORARY TABLE tmp_business_templates_json_table_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_business_templates_json_table_guard CHECK (must_be_zero=0)
) ENGINE=MEMORY;

INSERT INTO tmp_business_templates_json_table_guard (must_be_zero)
SELECT 1
FROM business_templates
WHERE JSON_LENGTH(content)<>1
   OR COALESCE(JSON_TYPE(JSON_EXTRACT(content,'$.items')),'NULL')<>'ARRAY'
   OR JSON_LENGTH(content,'$.items') NOT BETWEEN 1 AND 200
LIMIT 1;

INSERT INTO tmp_business_templates_json_table_guard (must_be_zero)
SELECT 1
FROM business_templates template
JOIN JSON_TABLE(
  template.content,'$.items[*]' COLUMNS (item_number FOR ORDINALITY)
) item
WHERE COALESCE(JSON_TYPE(JSON_EXTRACT(template.content,CONCAT('$.items[',item.item_number-1,']'))),'NULL')<>'OBJECT'
   OR COALESCE(JSON_TYPE(JSON_EXTRACT(template.content,CONCAT('$.items[',item.item_number-1,'].key'))),'NULL')<>'STRING'
   OR CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(template.content,CONCAT('$.items[',item.item_number-1,'].key')))) NOT BETWEEN 1 AND 100
   OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(template.content,CONCAT('$.items[',item.item_number-1,'].key')))))=0
   OR JSON_LENGTH(JSON_EXTRACT(template.content,CONCAT('$.items[',item.item_number-1,']')))<>
      1+JSON_CONTAINS_PATH(template.content,'one',CONCAT('$.items[',item.item_number-1,'].unit'))
   OR (
     JSON_CONTAINS_PATH(template.content,'one',CONCAT('$.items[',item.item_number-1,'].unit'))=1
     AND (
       COALESCE(JSON_TYPE(JSON_EXTRACT(template.content,CONCAT('$.items[',item.item_number-1,'].unit'))),'NULL')<>'STRING'
       OR CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(template.content,CONCAT('$.items[',item.item_number-1,'].unit'))))>20
     )
   )
LIMIT 1;

DROP TEMPORARY TABLE tmp_business_templates_json_table_guard;

-- Append one row at a time so the original preset order is explicit.
WITH RECURSIVE template_table_rows (template_id,next_item,items,converted_rows) AS (
  SELECT id,0,JSON_EXTRACT(content,'$.items'),JSON_ARRAY()
  FROM business_templates
  UNION ALL
  SELECT template_id,next_item+1,items,
    JSON_ARRAY_APPEND(converted_rows,'$',JSON_OBJECT(
      'key',JSON_UNQUOTE(JSON_EXTRACT(items,CONCAT('$[',next_item,'].key'))),
      'value','',
      'unit',COALESCE(JSON_UNQUOTE(JSON_EXTRACT(items,CONCAT('$[',next_item,'].unit'))),'')
    ))
  FROM template_table_rows
  WHERE next_item<JSON_LENGTH(items)
)
UPDATE business_templates template
JOIN template_table_rows converted
  ON converted.template_id=template.id AND converted.next_item=JSON_LENGTH(converted.items)
SET template.content=JSON_OBJECT(
      'columns',JSON_ARRAY(
        JSON_OBJECT('key','key','label','参数名称'),
        JSON_OBJECT('key','value','label','参数值'),
        JSON_OBJECT('key','unit','label','单位')
      ),
      'rows',converted.converted_rows
    ),
    template.updated_at=template.updated_at;

ALTER TABLE business_templates
  DROP CHECK chk_business_templates_scene,
  DROP CHECK chk_business_templates_content,
  DROP INDEX uk_business_templates_scene_name,
  DROP INDEX idx_business_templates_scene_status_name,
  DROP COLUMN scene_code,
  ADD UNIQUE KEY uk_business_templates_name (name),
  ADD KEY idx_business_templates_status_name (is_deleted,status,name,id),
  ADD CONSTRAINT chk_business_templates_content CHECK (
    JSON_TYPE(content)='OBJECT'
    AND JSON_LENGTH(content)=2
    AND COALESCE(JSON_TYPE(JSON_EXTRACT(content,'$.columns')),'NULL')='ARRAY'
    AND JSON_LENGTH(content,'$.columns') BETWEEN 1 AND 20
    AND COALESCE(JSON_TYPE(JSON_EXTRACT(content,'$.rows')),'NULL')='ARRAY'
    AND JSON_LENGTH(content,'$.rows')<=200
  );
