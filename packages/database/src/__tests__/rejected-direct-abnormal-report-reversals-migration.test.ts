import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (suffix: 'up' | 'down') =>
  readFile(
    resolve(migrationsDir, `202608250001-rejected-direct-abnormal-report-reversals.${suffix}.sql`),
    'utf8',
  );

describe('rejected direct abnormal report reversals migration', () => {
  it('backfills only rejected pure-abnormal direct reports without an existing reversal', async () => {
    const sql = await readMigration('up');

    expect(sql).toContain("disposition.review_status = 'rejected'");
    expect(sql).toContain("source_report.report_type = 'normal'");
    expect(sql).toContain('source_report.replaces_report_id IS NULL');
    expect(sql).toContain('source_report.normal_quantity = 0');
    expect(sql).toContain('source_report.abnormal_quantity > 0');
    expect(sql).toContain('existing_reversal.id IS NULL');
    expect(sql).toContain('completed_rework.id IS NULL');
    expect(sql).toContain("CONCAT('LEGACY-REJECT-REV-', disposition.id)");
  });

  it('rolls back only deterministic legacy rejection reversals', async () => {
    const sql = await readMigration('down');

    expect(sql).toContain("reversal.report_no = CONCAT('LEGACY-REJECT-REV-', disposition.id)");
    expect(sql).toContain('reversal.reversal_of_report_id = disposition.batch_step_report_id');
    expect(sql).toContain("reversal.report_type = 'reversal'");
  });
});
