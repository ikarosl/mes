-- A saved template is user-maintained master data, including disabled or deleted records.
-- Refuse to discard it during a schema rollback.
CREATE TEMPORARY TABLE tmp_business_templates_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_business_templates_rollback_guard CHECK (must_be_zero=0)
) ENGINE=MEMORY;

INSERT INTO tmp_business_templates_rollback_guard (must_be_zero)
SELECT 1 FROM business_templates LIMIT 1;

DROP TEMPORARY TABLE tmp_business_templates_rollback_guard;
DROP TABLE business_templates;
