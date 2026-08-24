import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (suffix: 'up' | 'down') =>
  readFile(
    resolve(migrationsDir, `202608240001-integer-production-quantities.${suffix}.sql`),
    'utf8',
  );

describe('integer production quantities migration', () => {
  it('rejects fractional values for every persisted quantity in the current schema', async () => {
    const up = await readMigration('up');
    const tableColumns = new Map<string, string[]>([
      ['product_materials', ['quantity_per_unit']],
      ['work_orders', ['planned_quantity']],
      ['production_batches', ['planned_quantity', 'completed_quantity', 'qualified_quantity']],
      [
        'production_item_demand',
        ['quantity_per_unit_snapshot', 'planned_output_quantity_snapshot', 'need_number'],
      ],
      ['batch_step_reports', ['reported_quantity', 'normal_quantity', 'abnormal_quantity']],
      ['production_item_allocation', ['assigned_number']],
      ['outbound_detail', ['outbound_number']],
      ['inventory_transaction', ['quantity']],
      ['inbound_detail', ['inbound_number']],
      ['rework_records', ['rework_quantity']],
      ['batch_step_scrap_records', ['scrap_quantity']],
      ['batch_step_scrap_reproduction_authorization', ['authorized_quantity']],
      ['return_detail', ['return_number']],
      ['item_scrap', ['scrap_number']],
      ['stock_check_detail', ['system_quantity', 'actual_quantity']],
      ['production_scrap_supplement_plan_line', ['planned_quantity']],
    ]);

    for (const [table, columns] of tableColumns) {
      const alterTable = up.match(new RegExp(`ALTER TABLE ${table}([\\s\\S]*?);`))?.[1];
      expect(alterTable, `missing integer constraint for ${table}`).toBeDefined();
      for (const column of columns) {
        expect(alterTable).toContain(`TRUNCATE(${column}, 0)`);
      }
    }

    // 202608100001 moved these aggregates to batch_step_reports and dropped the legacy columns.
    expect(up).not.toContain('ALTER TABLE batch_step_records');
    expect(up).not.toContain('spec_values');
  });

  it('drops every integer constraint on rollback', async () => {
    const [up, down] = await Promise.all([readMigration('up'), readMigration('down')]);
    const constraints = [...up.matchAll(/ADD CONSTRAINT (chk_[a-z0-9_]+)/g)].map(
      (match) => match[1],
    );
    expect(constraints).toHaveLength(16);
    for (const constraint of constraints) expect(down).toContain(`DROP CHECK ${constraint}`);
  });

  it('does not constrain aggregate columns removed from batch_step_records', async () => {
    const migrationNames = (await readdir(migrationsDir)).filter(
      (name) => name.endsWith('.up.sql') && name > '202608100001-batch-step-reports.up.sql',
    );
    const laterMigrations = await Promise.all(
      migrationNames.map((name) => readFile(resolve(migrationsDir, name), 'utf8')),
    );
    const legacyColumns = [
      'output_quantity',
      'qualified_quantity',
      'abnormal_quantity',
      'rework_quantity',
    ];

    for (const sql of laterMigrations) {
      const batchStepRecordAlters = sql
        .split(';')
        .filter((statement) => /ALTER TABLE\s+batch_step_records\b/i.test(statement));
      for (const statement of batchStepRecordAlters) {
        for (const column of legacyColumns) {
          expect(statement).not.toContain(`TRUNCATE(${column}, 0)`);
        }
      }
    }
  });
});
