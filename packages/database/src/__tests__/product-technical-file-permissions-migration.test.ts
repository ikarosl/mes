import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

describe('product technical file permissions migration', () => {
  it('appends only the technical file permission catalog', async () => {
    const sql = await readFile(
      resolve(migrationsDir, '202607240001-product-technical-file-permissions.up.sql'),
      'utf8',
    );
    expect(sql).toContain("'product:files:view'");
    expect(sql).toContain("'product:files:upload'");
    expect(sql).toContain("'product:files:download'");
    expect(sql).toContain("'product:files:delete'");
    expect(sql).toContain("'product:files:attach'");
    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).not.toContain('ALTER TABLE');
  });
});
