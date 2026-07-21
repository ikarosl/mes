import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

describe('system permission migration', () => {
  it('seeds only the migrated dashboard and system permission catalog', async () => {
    const sql = await readFile(
      resolve(migrationsDir, '202607210001-system-permissions.up.sql'),
      'utf8',
    );

    expect(sql).toContain("'system:user:assign-roles'");
    expect(sql).toContain("'system:role:assign-permissions'");
    expect(sql).not.toContain("'product:");
    expect(sql).not.toContain("'production:");
    expect(sql).not.toContain("'warehouse:");
  });
});
