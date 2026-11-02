-- One-time 20261102 baseline: phase 1, template.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

CREATE TABLE `business_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `content` json NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'enabled',
  `version` int NOT NULL DEFAULT '0',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` bigint unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint NOT NULL DEFAULT '0',
  `deleted_by` bigint unsigned DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_business_templates_name` (`name`),
  KEY `fk_business_templates_created_by` (`created_by`),
  KEY `fk_business_templates_updated_by` (`updated_by`),
  KEY `fk_business_templates_deleted_by` (`deleted_by`),
  KEY `idx_business_templates_status_name` (`is_deleted`,`status`,`name`,`id`),
  CONSTRAINT `chk_business_templates_content` CHECK (((json_type(`content`) = _utf8mb4'OBJECT') and (json_length(`content`) = 2) and (coalesce(json_type(json_extract(`content`,_utf8mb4'$.columns')),_utf8mb4'NULL') = _utf8mb4'ARRAY') and (json_length(json_extract(`content`,_utf8mb4'$.columns')) between 1 and 20) and (coalesce(json_type(json_extract(`content`,_utf8mb4'$.rows')),_utf8mb4'NULL') = _utf8mb4'ARRAY') and (json_length(json_extract(`content`,_utf8mb4'$.rows')) <= 200))),
  CONSTRAINT `chk_business_templates_deleted` CHECK ((((`is_deleted` = 0) and (`deleted_by` is null) and (`deleted_at` is null)) or ((`is_deleted` = 1) and (`deleted_by` is not null) and (`deleted_at` is not null)))),
  CONSTRAINT `chk_business_templates_name` CHECK ((char_length(trim(`name`)) > 0)),
  CONSTRAINT `chk_business_templates_status` CHECK ((`status` in (_utf8mb4'enabled',_utf8mb4'disabled'))),
  CONSTRAINT `chk_business_templates_version` CHECK ((`version` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
