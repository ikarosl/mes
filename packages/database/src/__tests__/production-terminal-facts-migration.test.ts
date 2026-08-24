import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (suffix: 'up' | 'down') =>
  readFile(resolve(migrationsDir, `202608240002-production-terminal-facts.${suffix}.sql`), 'utf8');

describe('production terminal facts migration', () => {
  it('adds queryable cancellation and closure facts with user references', async () => {
    const sql = await readMigration('up');

    expect(sql).toContain('ADD COLUMN cancel_reason TEXT NULL');
    expect(sql).toContain('ADD COLUMN close_type VARCHAR(30) NULL');
    expect(sql).toContain('ADD COLUMN close_reason TEXT NULL');
    expect(sql).toContain('fk_work_orders_cancelled_by');
    expect(sql).toContain('fk_work_orders_closed_by');
    expect(sql).toContain('fk_production_batches_cancelled_by');
    expect(sql).toContain("action = 'work-order.close'");
    expect(sql).toContain("action = 'production-batch.cancel'");
  });

  it('provides a paired rollback for every added column and constraint', async () => {
    const sql = await readMigration('down');

    expect(sql).toContain('DROP FOREIGN KEY fk_production_batches_cancelled_by');
    expect(sql).toContain('DROP FOREIGN KEY fk_work_orders_closed_by');
    expect(sql).toContain('DROP CHECK chk_work_orders_close_type');
    expect(sql).toContain('DROP COLUMN cancel_reason');
    expect(sql).toContain('DROP COLUMN close_type');
  });
});
