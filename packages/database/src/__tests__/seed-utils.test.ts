import { describe, expect, it } from 'vitest';
import { readSeeds } from '../seed-utils.js';

describe('system seed', () => {
  it('discovers seed SQL in deterministic filename order', async () => {
    const seeds = await readSeeds();
    expect(seeds.map((seed) => seed.name)).toEqual(['001-system-access.sql']);
  });

  it('contains only idempotent, credential-free system access data', async () => {
    const [seed] = await readSeeds();
    expect(seed?.sql).toContain("'系统管理员', 'admin'");
    expect(seed?.sql).toContain("'全部权限', '*'");
    expect(seed?.sql.match(/ON DUPLICATE KEY UPDATE/g)).toHaveLength(2);
    expect(seed?.sql).toContain('INSERT IGNORE INTO role_permissions');
    expect(seed?.sql).not.toMatch(/INSERT\s+INTO\s+users/i);
    expect(seed?.sql).not.toMatch(/INSERT\s+INTO\s+departments/i);
    expect(seed?.sql).not.toContain('ADMIN_PASSWORD');
  });
});
