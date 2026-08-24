import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (suffix: 'up' | 'down') =>
  readFile(
    resolve(migrationsDir, `202608240003-production-document-cancellation-facts.${suffix}.sql`),
    'utf8',
  );

describe('production document cancellation facts migration', () => {
  it('adds cancellation facts to every independently cancelled document', async () => {
    const sql = await readMigration('up');

    for (const table of [
      'inbound_order',
      'outbound_order',
      'return_order',
      'stock_check_order',
      'item_scrap',
    ]) {
      expect(sql).toContain(`ALTER TABLE ${table}`);
    }
    expect(sql).toContain('ADD COLUMN cancel_source VARCHAR(30) NULL');
    expect(sql).toContain("cancel_source IN ('manual','production_batch')");
    expect(sql.match(/ADD COLUMN cancel_reason TEXT NULL/g)).toHaveLength(5);
    expect(sql.match(/REFERENCES users\(id\)/g)).toHaveLength(5);
  });

  it('provides paired rollback for the fields and references', async () => {
    const sql = await readMigration('down');

    expect(sql).toContain('DROP CHECK chk_outbound_order_cancel_source');
    expect(sql.match(/DROP COLUMN cancel_reason/g)).toHaveLength(5);
    expect(sql.match(/DROP COLUMN cancelled_by/g)).toHaveLength(5);
    expect(sql.match(/DROP COLUMN cancelled_at/g)).toHaveLength(5);
  });

  it('backfills only reliable historical cancellation facts from successful audits', async () => {
    const sql = await readMigration('up');
    for (const action of [
      'production-inbound.cancel',
      'production-material.outbound.cancel',
      'production-return.cancel',
      'production-stock-check.cancel',
      'production-material-loss.cancel',
      'production-batch.cancel',
    ]) {
      expect(sql).toContain(`action = '${action}'`);
    }
    expect(sql.match(/\btarget\.cancelled_by = ol\.user_id/g)).toHaveLength(5);
    expect(sql.match(/\btarget\.cancelled_at = ol\.created_at/g)).toHaveLength(5);
    expect(sql).toContain("target.cancel_source = 'manual'");
    expect(sql).toContain("cascade_target.cancel_source = 'production_batch'");
    expect(sql).not.toMatch(/UPDATE\s+outbound_order\s+cascade\b/i);
    expect(sql).toContain('cancelledPendingOutboundIds');
    expect(sql).not.toContain('target.cancel_reason =');
  });
});
