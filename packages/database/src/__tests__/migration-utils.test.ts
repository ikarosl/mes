import { describe, expect, it } from 'vitest';
import { checksum, schemaMigrationsTableExistsQuery } from '../migration-utils.js';

describe('migration checksum', () => {
  it('is deterministic and detects content changes', () => {
    expect(checksum('SELECT 1')).toBe(checksum('SELECT 1'));
    expect(checksum('SELECT 1')).not.toBe(checksum('SELECT 2'));
  });
});

describe('migration status query', () => {
  it('checks the system metadata table by existence instead of a nonexistent name column', () => {
    expect(schemaMigrationsTableExistsQuery).toContain('SELECT 1');
    expect(schemaMigrationsTableExistsQuery).toContain("table_name = '_schema_migrations'");
    expect(schemaMigrationsTableExistsQuery).not.toMatch(/SELECT\s+name/i);
  });
});
