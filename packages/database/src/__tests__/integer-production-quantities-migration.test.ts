import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (suffix: 'up' | 'down') =>
  readFile(
    resolve(migrationsDir, `202608240001-integer-production-quantities.${suffix}.sql`),
    'utf8',
  );

describe('integer production quantities migration', () => {
  it('rejects fractional values for every persisted quantity in the current scope', async () => {
    const up = await readMigration('up');
    for (const column of [
      'quantity_per_unit',
      'planned_quantity',
      'completed_quantity',
      'qualified_quantity',
      'quantity_per_unit_snapshot',
      'planned_output_quantity_snapshot',
      'need_number',
      'reported_quantity',
      'normal_quantity',
      'abnormal_quantity',
      'assigned_number',
      'outbound_number',
      'quantity',
      'inbound_number',
      'rework_quantity',
      'scrap_quantity',
      'authorized_quantity',
      'return_number',
      'scrap_number',
      'system_quantity',
      'actual_quantity',
    ]) {
      expect(up).toContain(`TRUNCATE(${column}, 0)`);
    }
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
});
