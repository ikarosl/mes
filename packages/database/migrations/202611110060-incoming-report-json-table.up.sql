-- Stop all Procurement/Quality report writers and preserve a matching backup/application first.
-- Existing report rows are copied as JSON without trimming, truncating, or changing their order.
-- Historical batch_no remains a saved fact; the new receipt-number rule applies only to new reports.
CREATE TEMPORARY TABLE tmp_incoming_report_table_guard (
  invalid_data TINYINT NOT NULL,
  CONSTRAINT chk_incoming_report_table_conversion CHECK (invalid_data = 0)
) ENGINE=MEMORY;

-- Reject unsupported legacy shapes before removing the immutable-update trigger or changing DDL.
-- Every stored key must have a corresponding displayed column; no historical cell may be hidden.
INSERT INTO tmp_incoming_report_table_guard (invalid_data)
SELECT 1 WHERE EXISTS (
  SELECT 1 FROM quality_incoming_inspection_report
  WHERE JSON_SCHEMA_VALID('{
    "type": "array",
    "minItems": 1,
    "maxItems": 100,
    "items": {
      "type": "object",
      "properties": {
        "inspectionItem": { "type": "string" },
        "acceptanceRequirement": { "type": "string" },
        "inspectionTool": { "type": "string" },
        "contentDescription": { "type": "string" },
        "inspectionResult": { "type": "string" }
      },
      "required": [
        "inspectionItem", "acceptanceRequirement", "inspectionTool",
        "contentDescription", "inspectionResult"
      ],
      "additionalProperties": false
    }
  }', report_rows) <> 1
);

-- This temporary validation snapshot is discarded before the migration finishes.
CREATE TEMPORARY TABLE tmp_incoming_report_table_before (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  rows_digest CHAR(64) NOT NULL,
  row_count SMALLINT UNSIGNED NOT NULL,
  batch_no VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO tmp_incoming_report_table_before (id,rows_digest,row_count,batch_no)
SELECT id,SHA2(CAST(report_rows AS CHAR),256),JSON_LENGTH(report_rows),batch_no
FROM quality_incoming_inspection_report;

DROP TRIGGER trg_incoming_report_no_update;
ALTER TABLE quality_incoming_inspection_report
  DROP CHECK chk_incoming_report_rows,
  RENAME COLUMN report_rows TO inspection_details;

UPDATE quality_incoming_inspection_report
SET inspection_details = JSON_OBJECT(
  'columns', JSON_ARRAY(
    JSON_OBJECT('key','inspectionItem','label','检验项目'),
    JSON_OBJECT('key','acceptanceRequirement','label','验收要求'),
    JSON_OBJECT('key','inspectionTool','label','检验工具'),
    JSON_OBJECT('key','contentDescription','label','检验内容描述'),
    JSON_OBJECT('key','inspectionResult','label','检验结果')
  ),
  'rows', inspection_details
);

CREATE TRIGGER trg_incoming_report_no_update BEFORE UPDATE ON quality_incoming_inspection_report
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Incoming inspection reports are immutable';

ALTER TABLE quality_incoming_inspection_report
  ADD CONSTRAINT chk_incoming_report_details CHECK (
    JSON_TYPE(inspection_details) = 'OBJECT'
    AND JSON_LENGTH(inspection_details) = 2
    AND JSON_CONTAINS_PATH(inspection_details,'all','$.columns','$.rows')
    AND JSON_TYPE(JSON_EXTRACT(inspection_details,'$.columns')) = 'ARRAY'
    AND JSON_LENGTH(inspection_details,'$.columns') BETWEEN 1 AND 20
    AND JSON_TYPE(JSON_EXTRACT(inspection_details,'$.rows')) = 'ARRAY'
    AND JSON_LENGTH(inspection_details,'$.rows') BETWEEN 1 AND 200
  );

INSERT INTO tmp_incoming_report_table_guard (invalid_data)
SELECT 1
WHERE (SELECT COUNT(*) FROM tmp_incoming_report_table_before)
       <> (SELECT COUNT(*) FROM quality_incoming_inspection_report);

INSERT INTO tmp_incoming_report_table_guard (invalid_data)
SELECT 1 WHERE EXISTS (
     SELECT 1 FROM tmp_incoming_report_table_before original
     LEFT JOIN quality_incoming_inspection_report report ON report.id=original.id
     WHERE report.id IS NULL
        OR SHA2(CAST(JSON_EXTRACT(report.inspection_details,'$.rows') AS CHAR),256)
           <> original.rows_digest
        OR JSON_LENGTH(report.inspection_details,'$.rows') <> original.row_count
        OR NOT (BINARY report.batch_no <=> BINARY original.batch_no)
   );
DROP TEMPORARY TABLE tmp_incoming_report_table_before;
DROP TEMPORARY TABLE tmp_incoming_report_table_guard;
