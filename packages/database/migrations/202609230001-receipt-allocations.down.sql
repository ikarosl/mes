-- Refuse to discard real receipt/allocation facts.
CREATE TEMPORARY TABLE guard_receipt_allocations (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_receipt_allocations SELECT IF(EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM procurement_order_line WHERE origin_receipt_line_id IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_receipt_allocations;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_allocation, DROP CHECK chk_inbound_detail_procurement_source, DROP INDEX idx_inbound_detail_allocation,
  RENAME COLUMN procurement_allocation_id TO procurement_acceptance_line_id, ADD COLUMN procurement_scope_id BIGINT UNSIGNED NULL;
ALTER TABLE procurement_supplier_return DROP FOREIGN KEY fk_supplier_return_allocation, DROP CHECK chk_procurement_return_basis, DROP INDEX uk_supplier_return_allocation,
  CHANGE COLUMN allocation_id acceptance_line_id BIGINT UNSIGNED NULL, ADD COLUMN scope_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE procurement_order_line DROP FOREIGN KEY fk_order_origin_allocation, DROP CHECK chk_procurement_order_quality_source, DROP CHECK chk_procurement_order_existing_receipt,
  RENAME COLUMN origin_allocation_id TO origin_acceptance_line_id;
DROP TABLE procurement_receipt_allocation;
ALTER TABLE procurement_receipt_acceptance DROP INDEX uk_receipt_acceptance_round_source;
ALTER TABLE procurement_receipt_round DROP FOREIGN KEY fk_round_allocation_source, DROP COLUMN source_allocation_round_id, DROP CHECK chk_receipt_round_trigger,
  ADD CONSTRAINT chk_receipt_round_trigger CHECK(trigger_type IN('receipt','receipt_correction','review','acceptance_correction','manual_rejection'));
CREATE TABLE `procurement_receipt_acceptance_line` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `acceptance_id` bigint unsigned NOT NULL,
  `receipt_line_id` bigint unsigned NOT NULL,
  `line_no` int NOT NULL,
  `purchase_order_line_id` bigint unsigned DEFAULT NULL,
  `disposition` varchar(30) NOT NULL,
  `quantity` int NOT NULL,
  `return_reason` varchar(30) DEFAULT NULL,
  `remark` text,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_receipt_acceptance_detail_no` (`acceptance_id`,`line_no`),
  UNIQUE KEY `uk_receipt_acceptance_detail_source` (`id`,`receipt_line_id`),
  KEY `idx_receipt_acceptance_purchase` (`purchase_order_line_id`,`id`),
  KEY `fk_receipt_acceptance_detail_header` (`acceptance_id`,`receipt_line_id`),
  KEY `fk_receipt_acceptance_detail_actor` (`created_by`),
  CONSTRAINT `fk_receipt_acceptance_detail_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_receipt_acceptance_detail_header` FOREIGN KEY (`acceptance_id`, `receipt_line_id`) REFERENCES `procurement_receipt_acceptance` (`id`, `receipt_line_id`),
  CONSTRAINT `fk_receipt_acceptance_detail_purchase` FOREIGN KEY (`purchase_order_line_id`) REFERENCES `procurement_order_line` (`id`),
  CONSTRAINT `chk_receipt_acceptance_detail_disposition` CHECK ((`disposition` in (_utf8mb4'inbound',_utf8mb4'return',_utf8mb4'pending'))),
  CONSTRAINT `chk_receipt_acceptance_detail_inbound` CHECK (((`disposition` <> _utf8mb4'inbound') or (`purchase_order_line_id` is not null))),
  CONSTRAINT `chk_receipt_acceptance_detail_quantity` CHECK (((`quantity` between 1 and 99999999) and (`line_no` > 0))),
  CONSTRAINT `chk_receipt_acceptance_detail_return` CHECK ((((`disposition` = _utf8mb4'return') and (`return_reason` is not null) and (`return_reason` in (_utf8mb4'quality',_utf8mb4'excess',_utf8mb4'procurement_termination'))) or ((`disposition` <> _utf8mb4'return') and (`return_reason` is null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `procurement_receipt_scope` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `receipt_line_id` bigint unsigned NOT NULL,
  `receipt_revision_id` bigint unsigned NOT NULL,
  `parent_scope_id` bigint unsigned DEFAULT NULL,
  `quantity` int NOT NULL,
  `disposition` varchar(30) NOT NULL,
  `transition_type` varchar(30) NOT NULL,
  `inspection_id` bigint unsigned DEFAULT NULL,
  `review_case_id` bigint unsigned DEFAULT NULL,
  `termination_root_scope_id` bigint unsigned DEFAULT NULL,
  `termination_reason` text,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` bigint unsigned NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `version` int NOT NULL DEFAULT '0',
  `acceptance_line_id` bigint unsigned DEFAULT NULL,
  `round_id` bigint unsigned NOT NULL,
  `superseded_by_round_id` bigint unsigned DEFAULT NULL,
  `rejection_reason` text,
  `rejected_by` bigint unsigned DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_procurement_scope_line` (`id`,`receipt_line_id`),
  UNIQUE KEY `uk_receipt_scope_round` (`id`,`receipt_line_id`,`round_id`),
  KEY `idx_procurement_scope_disposition` (`receipt_line_id`,`disposition`,`id`),
  KEY `idx_procurement_scope_case` (`review_case_id`,`id`),
  KEY `idx_procurement_scope_inspection` (`inspection_id`,`id`),
  KEY `fk_procurement_scope_revision` (`receipt_revision_id`,`receipt_line_id`),
  KEY `fk_procurement_scope_termination` (`termination_root_scope_id`,`receipt_line_id`),
  KEY `fk_procurement_scope_creator` (`created_by`),
  KEY `fk_procurement_scope_updater` (`updated_by`),
  KEY `fk_procurement_scope_inspection` (`inspection_id`,`receipt_line_id`),
  KEY `fk_procurement_scope_case` (`review_case_id`,`receipt_line_id`),
  KEY `fk_procurement_scope_acceptance` (`acceptance_line_id`,`receipt_line_id`),
  KEY `idx_receipt_scope_round` (`round_id`,`disposition`,`id`),
  KEY `idx_receipt_scope_parent_round` (`parent_scope_id`,`receipt_line_id`,`round_id`),
  KEY `fk_receipt_scope_round` (`round_id`,`receipt_line_id`),
  KEY `fk_receipt_scope_superseding_round` (`superseded_by_round_id`,`receipt_line_id`),
  KEY `fk_receipt_scope_rejector` (`rejected_by`),
  CONSTRAINT `fk_procurement_scope_acceptance` FOREIGN KEY (`acceptance_line_id`, `receipt_line_id`) REFERENCES `procurement_receipt_acceptance_line` (`id`, `receipt_line_id`),
  CONSTRAINT `fk_procurement_scope_case` FOREIGN KEY (`review_case_id`, `receipt_line_id`) REFERENCES `quality_inspection_case` (`id`, `receipt_line_id`),
  CONSTRAINT `fk_procurement_scope_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_procurement_scope_inspection` FOREIGN KEY (`inspection_id`, `receipt_line_id`) REFERENCES `quality_inspection_record` (`id`, `receipt_line_id`),
  CONSTRAINT `fk_procurement_scope_line` FOREIGN KEY (`receipt_line_id`) REFERENCES `procurement_receipt_line` (`id`),
  CONSTRAINT `fk_procurement_scope_parent` FOREIGN KEY (`parent_scope_id`, `receipt_line_id`, `round_id`) REFERENCES `procurement_receipt_scope` (`id`, `receipt_line_id`, `round_id`),
  CONSTRAINT `fk_procurement_scope_revision` FOREIGN KEY (`receipt_revision_id`, `receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  CONSTRAINT `fk_procurement_scope_termination` FOREIGN KEY (`termination_root_scope_id`, `receipt_line_id`) REFERENCES `procurement_receipt_scope` (`id`, `receipt_line_id`),
  CONSTRAINT `fk_procurement_scope_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_receipt_scope_rejector` FOREIGN KEY (`rejected_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_receipt_scope_round` FOREIGN KEY (`round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`),
  CONSTRAINT `fk_receipt_scope_superseding_round` FOREIGN KEY (`superseded_by_round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`),
  CONSTRAINT `chk_procurement_scope_disposition` CHECK ((`disposition` in (_utf8mb4'pending',_utf8mb4'approved',_utf8mb4'quality_return',_utf8mb4'excess_return',_utf8mb4'termination_return',_utf8mb4'manual_rejected',_utf8mb4'inbounded',_utf8mb4'returned',_utf8mb4'superseded'))),
  CONSTRAINT `chk_procurement_scope_formal` CHECK (((`disposition` in (_utf8mb4'superseded',_utf8mb4'manual_rejected')) or ((`disposition` = _utf8mb4'returned') and (`rejection_reason` is not null)) or ((`acceptance_line_id` is not null) and (`inspection_id` is not null)))),
  CONSTRAINT `chk_procurement_scope_quantity` CHECK ((`quantity` between 1 and 99999999)),
  CONSTRAINT `chk_procurement_scope_terminal_reason` CHECK ((((`termination_root_scope_id` is null) and (`termination_reason` is null)) or ((`termination_root_scope_id` is not null) and (`termination_reason` is not null) and (char_length(trim(`termination_reason`)) > 0)))),
  CONSTRAINT `chk_procurement_scope_transition` CHECK ((`transition_type` in (_utf8mb4'split',_utf8mb4'acceptance',_utf8mb4'termination',_utf8mb4'inbound',_utf8mb4'return',_utf8mb4'manual_rejection'))),
  CONSTRAINT `chk_procurement_scope_version` CHECK ((`version` >= 0)),
  CONSTRAINT `chk_receipt_scope_rejection` CHECK ((((`rejection_reason` is null) and (`rejected_by` is null) and (`rejected_at` is null) and (`disposition` <> _utf8mb4'manual_rejected')) or ((`rejection_reason` is not null) and (char_length(trim(`rejection_reason`)) > 0) and (`rejected_by` is not null) and (`rejected_at` is not null) and (`disposition` in (_utf8mb4'manual_rejected',_utf8mb4'returned',_utf8mb4'superseded'))))),
  CONSTRAINT `chk_receipt_scope_superseded` CHECK (((`superseded_by_round_id` is null) or (`disposition` = _utf8mb4'superseded')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_procurement_receipt_acceptance_line_no_update BEFORE UPDATE ON procurement_receipt_acceptance_line
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';
CREATE TRIGGER trg_procurement_receipt_acceptance_line_no_delete BEFORE DELETE ON procurement_receipt_acceptance_line
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';
ALTER TABLE inbound_detail
  ADD CONSTRAINT `fk_inbound_detail_procurement_acceptance` FOREIGN KEY (`procurement_acceptance_line_id`, `procurement_receipt_line_id`) REFERENCES `procurement_receipt_acceptance_line` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_inbound_detail_procurement_scope` FOREIGN KEY (`procurement_scope_id`, `procurement_receipt_line_id`) REFERENCES `procurement_receipt_scope` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `chk_inbound_detail_acceptance` CHECK ((((`procurement_receipt_line_id` is null) and (`procurement_acceptance_line_id` is null)) or ((`procurement_receipt_line_id` is not null) and (`procurement_acceptance_line_id` is not null)))),
  ADD CONSTRAINT `chk_inbound_detail_procurement_source` CHECK ((((`procurement_receipt_line_id` is null) and (`procurement_receipt_revision_id` is null) and (`procurement_scope_id` is null) and (`procurement_inspection_id` is null)) or ((`product_id` is null) and (`procurement_receipt_line_id` is not null) and (`procurement_receipt_revision_id` is not null) and (`procurement_scope_id` is not null) and (`procurement_inspection_id` is not null))));
ALTER TABLE procurement_supplier_return
  ADD CONSTRAINT `fk_procurement_return_acceptance` FOREIGN KEY (`acceptance_line_id`, `receipt_line_id`) REFERENCES `procurement_receipt_acceptance_line` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_procurement_return_scope` FOREIGN KEY (`scope_id`, `receipt_line_id`) REFERENCES `procurement_receipt_scope` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `chk_procurement_return_basis` CHECK (((`reason_type` = _utf8mb4'manual_rejection') or ((`acceptance_line_id` is not null) and (`inspection_id` is not null))));
ALTER TABLE procurement_order_line
  ADD CONSTRAINT `fk_procurement_order_origin_acceptance` FOREIGN KEY (`origin_acceptance_line_id`, `origin_receipt_line_id`) REFERENCES `procurement_receipt_acceptance_line` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `chk_procurement_order_existing_receipt` CHECK (((`fulfillment_mode` <> _utf8mb4'existing_receipt') or ((`origin_order_line_id` is not null) and (`origin_receipt_line_id` is not null) and (`origin_acceptance_line_id` is null)))),
  ADD CONSTRAINT `chk_procurement_order_quality_source` CHECK (((`origin_acceptance_line_id` is null) or ((`origin_receipt_line_id` is not null) and (`origin_order_line_id` is not null) and (`fulfillment_mode` = _utf8mb4'new_arrival'))));
ALTER TABLE inbound_detail ADD UNIQUE KEY uk_inbound_detail_procurement_scope(procurement_scope_id);
ALTER TABLE procurement_supplier_return ADD UNIQUE KEY uk_procurement_supplier_return_scope(scope_id);
