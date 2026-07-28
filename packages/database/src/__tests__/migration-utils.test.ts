import { describe, expect, it } from 'vitest';
import {
  acquireMigrationLockQuery,
  checksum,
  migrationLockName,
  migrationStatus,
  releaseMigrationLockQuery,
  schemaMigrationsTableExistsQuery,
} from '../migration-utils.js';

describe('migration checksum', () => {
  it('is deterministic and detects content changes', () => {
    expect(checksum('SELECT 1')).toBe(checksum('SELECT 1'));
    expect(checksum('SELECT 1')).not.toBe(checksum('SELECT 2'));
  });
});

describe('migration advisory lock', () => {
  it('uses MySQL advisory-lock queries with a stable lock name', () => {
    expect(migrationLockName).toBe('company_mes_migration');
    expect(acquireMigrationLockQuery).toContain('GET_LOCK');
    expect(releaseMigrationLockQuery).toContain('RELEASE_LOCK');
  });
});

describe('migration status query', () => {
  it('checks the system metadata table by existence instead of a nonexistent name column', () => {
    expect(schemaMigrationsTableExistsQuery).toContain('SELECT 1');
    expect(schemaMigrationsTableExistsQuery).toContain("table_name = '_schema_migrations'");
    expect(schemaMigrationsTableExistsQuery).not.toMatch(/SELECT\s+name/i);
  });
});

describe('migration readiness status', () => {
  it('fails closed for pending and checksum-mismatched migrations', () => {
    expect(migrationStatus(undefined, 'expected')).toBe('pending');
    expect(migrationStatus('different', 'expected')).toBe('checksum-mismatch');
    expect(migrationStatus('expected', 'expected')).toBe('applied');
  });
});
