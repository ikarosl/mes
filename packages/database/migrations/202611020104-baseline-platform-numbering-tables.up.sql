-- One-time 20261102 baseline: phase 1, platform-numbering.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

CREATE TABLE `business_number_daily_sequence` (
  `number_kind` varchar(64) NOT NULL COMMENT 'Stable business numbering kind',
  `number_date` date NOT NULL COMMENT 'Beijing calendar day from the database clock',
  `last_sequence` bigint unsigned NOT NULL COMMENT 'Last allocated sequence; not recycled after commit',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`number_kind`,`number_date`),
  CONSTRAINT `chk_business_number_kind` CHECK ((`number_kind` in (_utf8mb4'work_order',_utf8mb4'production_batch',_utf8mb4'purchase_order',_utf8mb4'purchase_receipt',_utf8mb4'incoming_inspection_order',_utf8mb4'supplier_return',_utf8mb4'purchase_inbound',_utf8mb4'finished_inbound',_utf8mb4'other_inbound',_utf8mb4'other_outbound',_utf8mb4'inventory_batch',_utf8mb4'stock_check',_utf8mb4'production_material_outbound',_utf8mb4'production_material_return',_utf8mb4'material_loss',_utf8mb4'manual_material_demand',_utf8mb4'rework',_utf8mb4'step_report',_utf8mb4'abnormal_disposition',_utf8mb4'scrap_supplement_plan',_utf8mb4'material_supplement',_utf8mb4'approval_instance'))),
  CONSTRAINT `chk_business_number_sequence_positive` CHECK ((`last_sequence` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
