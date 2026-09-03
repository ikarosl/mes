import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (direction: 'up' | 'down') =>
  readFile(
    resolve(migrationsDir, `202609010001-production-demand-generation-groups.${direction}.sql`),
    'utf8',
  );

describe('production demand generation groups migration', () => {
  it('backfills and requires a stable generation group for every demand', async () => {
    const sql = await readMigration('up');

    expect(sql).toContain('ADD COLUMN generation_group_key VARCHAR(150) NULL');
    expect(sql).toContain('UPDATE production_item_demand');
    expect(sql).toContain('MODIFY COLUMN generation_group_key VARCHAR(150) NOT NULL');
    expect(sql).toContain('idempotency_key LIKE CONCAT(generation_group_key');
    expect(sql).toContain('idx_production_item_demand_generation_group');
  });

  it('removes the constraint, index and group field on rollback', async () => {
    const sql = await readMigration('down');

    expect(sql).toContain('DROP CHECK chk_production_item_demand_generation_group_key');
    expect(sql).toContain('DROP KEY idx_production_item_demand_generation_group');
    expect(sql).toContain('DROP COLUMN generation_group_key');
  });
});
