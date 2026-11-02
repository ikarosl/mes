-- One-time 20261102 baseline: phase 2, quality.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `quality_incoming_inspection_order`
  ADD CONSTRAINT `fk_incoming_inspection_order_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_incoming_inspection_order_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `quality_incoming_inspection_order_receipt`
  ADD CONSTRAINT `fk_incoming_inspection_order_receipt_order` FOREIGN KEY (`inspection_order_id`) REFERENCES `quality_incoming_inspection_order` (`id`),
  ADD CONSTRAINT `fk_incoming_inspection_order_receipt_source` FOREIGN KEY (`receipt_id`) REFERENCES `procurement_receipt` (`id`);

ALTER TABLE `quality_inspection_case`
  ADD CONSTRAINT `fk_quality_case_finished` FOREIGN KEY (`closeout_id`, `production_batch_id`) REFERENCES `production_batch_closeout` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_quality_case_finished_round` FOREIGN KEY (`finished_round_id`, `closeout_id`) REFERENCES `production_output_round` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_quality_case_incoming_round` FOREIGN KEY (`incoming_round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_quality_case_superseding_round` FOREIGN KEY (`superseded_by_round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_quality_inspection_case_completer` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_quality_inspection_case_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_quality_inspection_case_line` FOREIGN KEY (`receipt_line_id`) REFERENCES `procurement_receipt_line` (`id`),
  ADD CONSTRAINT `fk_quality_inspection_case_revision` FOREIGN KEY (`receipt_revision_id`, `receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_quality_inspection_case_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `quality_inspection_record`
  ADD CONSTRAINT `fk_quality_record_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_quality_record_case` FOREIGN KEY (`case_id`) REFERENCES `quality_inspection_case` (`id`),
  ADD CONSTRAINT `fk_quality_record_finished` FOREIGN KEY (`case_id`, `closeout_id`, `production_batch_id`) REFERENCES `quality_inspection_case` (`id`, `closeout_id`, `production_batch_id`),
  ADD CONSTRAINT `fk_quality_record_previous_finished` FOREIGN KEY (`previous_record_id`, `closeout_id`) REFERENCES `quality_inspection_record` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_quality_record_previous_receipt` FOREIGN KEY (`previous_record_id`, `receipt_line_id`) REFERENCES `quality_inspection_record` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_quality_record_receipt` FOREIGN KEY (`case_id`, `receipt_line_id`, `receipt_revision_id`) REFERENCES `quality_inspection_case` (`id`, `receipt_line_id`, `receipt_revision_id`);

ALTER TABLE `quality_process_inspection`
  ADD CONSTRAINT `fk_process_inspection_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_inspection_current` FOREIGN KEY (`current_record_id`, `id`) REFERENCES `quality_process_inspection_record` (`id`, `inspection_id`),
  ADD CONSTRAINT `fk_process_inspection_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_process_inspection_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `quality_process_inspection_record`
  ADD CONSTRAINT `fk_process_inspection_record_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_inspection_record_header` FOREIGN KEY (`inspection_id`) REFERENCES `quality_process_inspection` (`id`),
  ADD CONSTRAINT `fk_process_inspection_record_replacement` FOREIGN KEY (`replaces_record_id`, `inspection_id`) REFERENCES `quality_process_inspection_record` (`id`, `inspection_id`),
  ADD CONSTRAINT `fk_process_inspection_record_reversal` FOREIGN KEY (`reversal_of_record_id`, `inspection_id`) REFERENCES `quality_process_inspection_record` (`id`, `inspection_id`);
