import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (name: string) => readFile(resolve(migrationsDir, name), 'utf8');

describe('production execution safety migrations', () => {
  it('adds the explicit non-reporting step completion permission and route', async () => {
    const [up, down] = await Promise.all([
      readMigration('202608130001-production-non-reporting-step-completion.up.sql'),
      readMigration('202608130001-production-non-reporting-step-completion.down.sql'),
    ]);

    expect(up).toContain("'production:steps:complete'");
    expect(up).toContain(
      "'/api/production/batches/:batchId/step-records/:recordId/actions/complete'",
    );
    expect(up).toContain(
      "NULL, 'POST', '/api/production/batches/:batchId/step-records/:recordId/actions/complete'",
    );
    expect(down).toContain('DELETE rp');
    expect(down).toContain('FROM role_permissions rp');
    expect(down).toContain("WHERE p.code = 'production:steps:complete'");
    expect(down).toContain("DELETE FROM permissions WHERE code = 'production:steps:complete'");
  });

  it('makes inventory transactions immutable outside explicitly marked dedicated test databases', async () => {
    const [up, down] = await Promise.all([
      readMigration('202608130002-inventory-transaction-immutability.up.sql'),
      readMigration('202608130002-inventory-transaction-immutability.down.sql'),
    ]);

    expect(up).toContain('BEFORE UPDATE ON inventory_transaction');
    expect(up).toContain('BEFORE DELETE ON inventory_transaction');
    expect(up).toContain('@company_inventory_test_cleanup');
    expect(up).toContain("DATABASE() NOT LIKE '%\\\\_test'");
    expect(up).toContain("DATABASE() NOT LIKE '%\\\\_ci'");
    expect(up).toContain("SIGNAL SQLSTATE '45000'");
    expect(down).toContain('DROP TRIGGER IF EXISTS trg_inventory_transaction_reject_delete');
    expect(down).toContain('DROP TRIGGER IF EXISTS trg_inventory_transaction_reject_update');
  });
});
