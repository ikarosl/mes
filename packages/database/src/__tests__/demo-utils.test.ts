import { describe, expect, it } from 'vitest';
import { assertDemoSeedEnabled, readDemoSeeds } from '../demo-utils.js';

describe('demo seed', () => {
  it('requires an explicit gate and a non-trivial password', () => {
    expect(() =>
      assertDemoSeedEnabled({
        NODE_ENV: 'production',
        ALLOW_DEMO_SEED: '1',
        DEMO_USER_PASSWORD: 'demo-password',
      }),
    ).toThrow('生产环境不能运行演示数据种子');
    expect(() => assertDemoSeedEnabled({})).toThrow('演示数据种子已禁用');
    expect(() =>
      assertDemoSeedEnabled({ ALLOW_DEMO_SEED: '1', DEMO_USER_PASSWORD: '12345' }),
    ).toThrow('长度必须至少为 6 个字符');
    expect(
      assertDemoSeedEnabled({ ALLOW_DEMO_SEED: '1', DEMO_USER_PASSWORD: 'demo-password' }),
    ).toBe('demo-password');
  });

  it('discovers only the scoped system and product demo data', async () => {
    const seeds = await readDemoSeeds();
    expect(seeds.map((seed) => seed.name)).toEqual(['001-system-demo.sql', '010-product-demo.sql']);
    const sql = seeds.map((seed) => seed.sql).join('\n');
    expect(sql).toContain('operator-001');
    expect(sql).toContain('p-micro-20-30');
    expect(sql).not.toMatch(/production_orders|production_batches|inventory_transaction/);
    expect(sql).not.toMatch(/password_hash\s*=\s*['"]/i);
  });
});
