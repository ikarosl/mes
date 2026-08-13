import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

describe('production core migration', () => {
  it('defines the Production persistence tables, immutable demand snapshot and paired rollbacks', async () => {
    const [core, demand, planDates, execution, alignment, reports, designAlignment] =
      await Promise.all([
        readMigration('202607300001-production-core.up.sql'),
        readMigration('202607300002-production-item-demand.up.sql'),
        readMigration('202607300003-production-batch-plan-dates.up.sql'),
        readMigration('202607300004-production-batch-step-execution-overrides.up.sql'),
        readMigration('202607300005-production-demand-design-alignment.up.sql'),
        readMigration('202608100001-batch-step-reports.up.sql'),
        readMigration('202608110001-production-abnormal-dispositions-and-demand-type-codes.up.sql'),
      ]);
    const [
      coreDown,
      demandDown,
      planDatesDown,
      executionDown,
      alignmentDown,
      reportsDown,
      designAlignmentDown,
    ] = await Promise.all([
      readMigration('202607300001-production-core.down.sql'),
      readMigration('202607300002-production-item-demand.down.sql'),
      readMigration('202607300003-production-batch-plan-dates.down.sql'),
      readMigration('202607300004-production-batch-step-execution-overrides.down.sql'),
      readMigration('202607300005-production-demand-design-alignment.down.sql'),
      readMigration('202608100001-batch-step-reports.down.sql'),
      readMigration('202608110001-production-abnormal-dispositions-and-demand-type-codes.down.sql'),
    ]);

    expect(core).toContain('CREATE TABLE work_orders');
    expect(core).toContain('CREATE TABLE production_batches');
    expect(core).toContain('CREATE TABLE batch_step_records');
    expect(core).toContain('planned_quantity DECIMAL(12,4) NOT NULL');
    expect(demand).toContain('CREATE TABLE production_item_demand');
    expect(demand).toContain('need_number DECIMAL(12,4) NOT NULL');
    expect(demand).toContain('UNIQUE KEY uk_production_item_demand_idempotency (idempotency_key)');
    expect(demand).toContain('quantity_per_unit_snapshot DECIMAL(12,4) NOT NULL');
    expect(demand).toContain('planned_output_quantity_snapshot DECIMAL(12,4) NOT NULL');
    expect(planDates).toContain('ADD CONSTRAINT chk_production_batches_plan_dates');
    expect(execution).toContain('actual_sop_version_no_snapshot VARCHAR(64) NULL');
    expect(alignment).toContain('idx_work_orders_external_order_no (external_order_no)');
    expect(alignment).toContain('fk_production_item_demand_parent');
    expect(alignment).toContain('idx_production_item_demand_source_scrap (source_scrap_id)');
    expect(alignment).toContain('CHECK (demand_type IN (0, 1))');
    expect(reports).toContain('CREATE TABLE batch_step_reports');
    expect(reports).toContain("report_type IN ('normal', 'reversal')");
    expect(reports).toContain('normal_quantity + abnormal_quantity = reported_quantity');
    expect(reports).toContain('UNIQUE KEY uk_batch_step_reports_reversal');
    expect(reports).toContain('UNIQUE KEY uk_batch_step_reports_replacement');
    expect(reports).toContain('DROP COLUMN output_quantity');
    expect(reports).toContain('DROP COLUMN rework_quantity');
    expect(reports).toContain("api_method = 'POST'");
    expect(reports).toContain(
      "api_path = '/api/production/batches/:batchId/step-records/:recordId/reports'",
    );
    expect(designAlignment).toContain('CREATE TABLE batch_step_abnormal_dispositions');
    expect(designAlignment).toContain(
      'UNIQUE KEY uk_batch_step_abnormal_dispositions_report (batch_step_report_id)',
    );
    expect(designAlignment).toContain(
      'REFERENCES batch_step_reports(id, batch_step_record_id, production_batch_id)',
    );
    expect(designAlignment).toContain("status IN ('pending', 'assigned', 'doing', 'completed')");
    expect(designAlignment).toContain('MODIFY COLUMN demand_type VARCHAR(30)');
    expect(designAlignment).toContain("WHEN '0' THEN 'normal'");
    expect(designAlignment).toContain("WHEN '1' THEN 'manual_additional'");
    expect(designAlignment).toContain("demand_type IN ('normal', 'manual_additional')");
    expect(designAlignment).toContain("report.report_type = 'normal'");
    expect(designAlignment).toContain('reversal.reversal_of_report_id = report.id');
    expect(coreDown).toContain('DROP TABLE batch_step_records;');
    expect(demandDown).toContain('DROP TABLE production_item_demand;');
    expect(planDatesDown).toContain('DROP COLUMN plan_end_date');
    expect(executionDown).toContain('DROP COLUMN actual_sop_version_no_snapshot');
    expect(alignmentDown).toContain('DROP FOREIGN KEY fk_production_item_demand_parent');
    expect(alignmentDown).toContain('DROP INDEX idx_work_orders_external_order_no');
    expect(reportsDown).toContain('ADD COLUMN output_quantity');
    expect(reportsDown).toContain('DROP TABLE batch_step_reports;');
    expect(reportsDown).toContain("api_method = 'PATCH'");
    expect(designAlignmentDown).toContain('DROP TABLE batch_step_abnormal_dispositions;');
    expect(designAlignmentDown).toContain('MODIFY COLUMN demand_type TINYINT');
    expect(designAlignmentDown).toContain(
      "status IN ('pending', 'assigned', 'doing', 'completed', 'abnormal')",
    );
  });

  it('adds a source-bound and reversible minimal rework record', async () => {
    const [up, down] = await Promise.all([
      readMigration('202608130003-production-rework.up.sql'),
      readMigration('202608130003-production-rework.down.sql'),
    ]);
    expect(up).toContain('CREATE TABLE rework_records');
    expect(up).toContain('UNIQUE KEY uk_rework_records_disposition');
    expect(up).toContain('UNIQUE KEY uk_rework_records_completed_report');
    expect(up).toContain('fk_rework_records_disposition_source');
    expect(up).toContain("status IN ('pending', 'doing', 'completed', 'cancelled')");
    expect(up).toContain("'production:steps:manage-abnormal'");
    expect(up).toContain("'production:rework:execute'");
    expect(down).toContain('DROP TABLE rework_records;');
    expect(down).toContain('DROP INDEX uk_batch_step_abnormal_dispositions_source');
  });

  it('removes every seeded Production permission before removing its parent menu', async () => {
    const sql = await readMigration('202607300001-production-core.down.sql');

    for (const code of [
      'production:orders:view',
      'production:orders:create',
      'production:orders:update',
      'production:orders:transition',
      'production:tasks:view',
      'production:batches:create',
      'production:batches:update',
      'production:batches:transition',
      'production:steps:report',
    ]) {
      expect(sql).toContain(`'${code}'`);
    }

    expect(sql.indexOf("'production:orders:view'")).toBeLessThan(
      sql.indexOf("DELETE FROM permissions WHERE code = 'production:view';"),
    );
  });
});

const readMigration = (name: string) => readFile(resolve(migrationsDir, name), 'utf8');
