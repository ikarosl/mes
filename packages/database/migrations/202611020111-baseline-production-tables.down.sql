-- One-time 20261102 baseline: phase 1, production.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0111_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0111_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0111_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `batch_step_abnormal_dispositions`)
   OR EXISTS (SELECT 1 FROM `batch_step_execution_actions`)
   OR EXISTS (SELECT 1 FROM `batch_step_records`)
   OR EXISTS (SELECT 1 FROM `batch_step_reports`)
   OR EXISTS (SELECT 1 FROM `batch_step_scrap_records`)
   OR EXISTS (SELECT 1 FROM `batch_step_scrap_reproduction_authorization`)
   OR EXISTS (SELECT 1 FROM `item_scrap`)
   OR EXISTS (SELECT 1 FROM `production_batch_closeout`)
   OR EXISTS (SELECT 1 FROM `production_batch_closeout_action`)
   OR EXISTS (SELECT 1 FROM `production_batches`)
   OR EXISTS (SELECT 1 FROM `production_demand_correction`)
   OR EXISTS (SELECT 1 FROM `production_item_allocation`)
   OR EXISTS (SELECT 1 FROM `production_item_demand`)
   OR EXISTS (SELECT 1 FROM `production_manual_demand_addition`)
   OR EXISTS (SELECT 1 FROM `production_material_requirement_basis`)
   OR EXISTS (SELECT 1 FROM `production_material_supplement`)
   OR EXISTS (SELECT 1 FROM `production_output_allocation`)
   OR EXISTS (SELECT 1 FROM `production_output_revision`)
   OR EXISTS (SELECT 1 FROM `production_output_round`)
   OR EXISTS (SELECT 1 FROM `production_scrap_supplement_plan`)
   OR EXISTS (SELECT 1 FROM `production_scrap_supplement_plan_line`)
   OR EXISTS (SELECT 1 FROM `rework_records`)
   OR EXISTS (SELECT 1 FROM `work_orders`);

DROP TEMPORARY TABLE tmp_baseline_0111_down_guard;

DROP TABLE `work_orders`;
DROP TABLE `rework_records`;
DROP TABLE `production_scrap_supplement_plan_line`;
DROP TABLE `production_scrap_supplement_plan`;
DROP TABLE `production_output_round`;
DROP TABLE `production_output_revision`;
DROP TABLE `production_output_allocation`;
DROP TABLE `production_material_supplement`;
DROP TABLE `production_material_requirement_basis`;
DROP TABLE `production_manual_demand_addition`;
DROP TABLE `production_item_demand`;
DROP TABLE `production_item_allocation`;
DROP TABLE `production_demand_correction`;
DROP TABLE `production_batches`;
DROP TABLE `production_batch_closeout_action`;
DROP TABLE `production_batch_closeout`;
DROP TABLE `item_scrap`;
DROP TABLE `batch_step_scrap_reproduction_authorization`;
DROP TABLE `batch_step_scrap_records`;
DROP TABLE `batch_step_reports`;
DROP TABLE `batch_step_records`;
DROP TABLE `batch_step_execution_actions`;
DROP TABLE `batch_step_abnormal_dispositions`;
