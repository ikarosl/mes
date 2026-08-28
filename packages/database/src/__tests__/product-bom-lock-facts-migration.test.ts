import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const migration = (suffix: 'up' | 'down') =>
  readFile(resolve(migrationsDir, `202608280001-product-bom-lock-facts.${suffix}.sql`), 'utf8');

describe('product BOM lock facts migration', () => {
  it('adds irreversible lock facts and backfills every product that has a production task', async () => {
    const sql = await migration('up');
    expect(sql).toContain('ADD COLUMN bom_locked_at DATETIME NULL');
    expect(sql).toContain('ADD COLUMN bom_locked_by BIGINT UNSIGNED NULL');
    expect(sql).toContain('FROM production_batches');
    expect(sql).toContain('MIN(id) first_batch_id');
    expect(sql).toContain('WHERE p.bom_locked_at IS NULL');
  });

  it('drops only the added lock schema on rollback', async () => {
    const sql = await migration('down');
    expect(sql).toContain('DROP FOREIGN KEY fk_products_bom_locked_by');
    expect(sql).toContain('DROP COLUMN bom_locked_by');
    expect(sql).toContain('DROP COLUMN bom_locked_at');
  });
});
