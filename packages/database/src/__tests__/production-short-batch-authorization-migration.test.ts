import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const migration = resolve(
  migrationsDir,
  '202608290001-production-short-batch-authorization.up.sql',
);

describe('production short batch authorization migration', () => {
  it('registers the partial-outbound state and task-level material plan version', async () => {
    const sql = await readFile(migration, 'utf8');
    expect(sql).toContain('material_partially_outbound');
    expect(sql).toContain('material_plan_version INT UNSIGNED NOT NULL DEFAULT 1');
  });

  it('persists auditable per-demand allowed shortages and explicit demand cancellation facts', async () => {
    const sql = await readFile(migration, 'utf8');
    expect(sql).toContain('CREATE TABLE production_short_batch_authorization');
    expect(sql).toContain('CREATE TABLE production_short_batch_authorization_detail');
    expect(sql).toContain('authorized_remaining_quantity BIGINT NOT NULL');
    expect(sql).toContain('ADD COLUMN cancel_source VARCHAR(40) NULL');
    expect(sql).toContain('ADD COLUMN cancel_reason TEXT NULL');
    expect(sql).toContain('production:materials:authorize-short-batch');
    expect(sql).toContain('production:materials:close-remaining-demands');
  });
});
