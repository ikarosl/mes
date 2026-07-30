import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

describe('production core migration', () => {
  it('defines the Production persistence tables, immutable demand snapshot and paired rollbacks', async () => {
    const [core, demand, planDates, execution, alignment] = await Promise.all([
      readMigration('202607300001-production-core.up.sql'),
      readMigration('202607300002-production-item-demand.up.sql'),
      readMigration('202607300003-production-batch-plan-dates.up.sql'),
      readMigration('202607300004-production-batch-step-execution-overrides.up.sql'),
      readMigration('202607300005-production-demand-design-alignment.up.sql'),
    ]);
    const [coreDown, demandDown, planDatesDown, executionDown, alignmentDown] = await Promise.all([
      readMigration('202607300001-production-core.down.sql'),
      readMigration('202607300002-production-item-demand.down.sql'),
      readMigration('202607300003-production-batch-plan-dates.down.sql'),
      readMigration('202607300004-production-batch-step-execution-overrides.down.sql'),
      readMigration('202607300005-production-demand-design-alignment.down.sql'),
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
    expect(coreDown).toContain('DROP TABLE batch_step_records;');
    expect(demandDown).toContain('DROP TABLE production_item_demand;');
    expect(planDatesDown).toContain('DROP COLUMN plan_end_date');
    expect(executionDown).toContain('DROP COLUMN actual_sop_version_no_snapshot');
    expect(alignmentDown).toContain('DROP FOREIGN KEY fk_production_item_demand_parent');
    expect(alignmentDown).toContain('DROP INDEX idx_work_orders_external_order_no');
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
