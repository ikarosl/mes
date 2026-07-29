import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

describe('product route-step SOP version snapshot migration', () => {
  it('adds and backfills an independent SOP version snapshot', async () => {
    const sql = await readFile(
      resolve(migrationsDir, '202607290002-product-route-step-sop-version-snapshot.up.sql'),
      'utf8',
    );

    expect(sql).toContain('ADD COLUMN sop_version_no_snapshot VARCHAR(64) NULL');
    expect(sql).toContain('SET route_step.sop_version_no_snapshot = technical_file.version_no');
    expect(sql).toContain(
      'sop_file_name_snapshot IS NULL AND sop_object_key_snapshot IS NULL AND sop_version_no_snapshot IS NULL',
    );
    expect(sql).toContain(
      'sop_file_name_snapshot IS NOT NULL AND sop_object_key_snapshot IS NOT NULL AND sop_version_no_snapshot IS NOT NULL',
    );
    expect(sql).not.toContain('CHECK (sop_file_id');
    expect(sql).toContain('information_schema.columns');
    expect(sql).toContain('information_schema.table_constraints');
    expect(sql).toContain('@sop_version_column_exists = 0');
    expect(sql).toContain('@sop_version_constraint_exists = 0');
  });

  it('provides a paired rollback without changing the historical Product migration', async () => {
    const sql = await readFile(
      resolve(migrationsDir, '202607290002-product-route-step-sop-version-snapshot.down.sql'),
      'utf8',
    );

    expect(sql).toContain('DROP CHECK chk_process_route_steps_sop_version_snapshot');
    expect(sql).toContain('DROP COLUMN sop_version_no_snapshot');
    expect(sql).toContain('information_schema.columns');
    expect(sql).toContain('information_schema.table_constraints');
  });
});
