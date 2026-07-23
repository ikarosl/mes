import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

describe('status code constraints migration', () => {
  it('adds checks to closed string code sets without using database enums', async () => {
    const sql = await readFile(
      resolve(migrationsDir, '202607230002-status-code-constraints.up.sql'),
      'utf8',
    );

    expect(sql).toContain("CHECK (type IN ('menu', 'page', 'button', 'api'))");
    expect(sql).toContain("CHECK (result IN ('success', 'failed'))");
    expect(sql).not.toMatch(/\bENUM\s*\(/i);
  });
});
