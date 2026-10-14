import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import { type Pool, type RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as materialFixtures from '../production/materials/material-test-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Inventory immutable ledger MySQL transactions', () => {
  const { fixture, cleanup } = materialFixtures;
  let pool: Pool;
  let actorId: number;

  beforeAll(async () => {
    ({ pool, actorId } = await materialFixtures.createMaterialTestContext((createdPool) => {
      pool = createdPool;
    }));
  });

  afterAll(async () => pool?.end());

  it('rejects inventory transaction update and delete outside the dedicated fixture cleanup connection', async () => {
    const fixtureData = await fixture(pool, actorId, 'ledger-immutable');
    try {
      await expect(
        pool.execute('UPDATE inventory_transaction SET quantity=quantity WHERE batch_id=?', [
          fixtureData.itemBatch1,
        ]),
      ).rejects.toBeDefined();
      await expect(
        pool.execute('DELETE FROM inventory_transaction WHERE batch_id=?', [
          fixtureData.itemBatch1,
        ]),
      ).rejects.toBeDefined();
      const [[row]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM inventory_transaction WHERE batch_id IN (?,?)',
        [fixtureData.itemBatch1, fixtureData.itemBatch2],
      );
      expect(Number(row?.count)).toBe(2);
    } finally {
      await cleanup(pool, fixtureData);
    }
  });
});

// TODO(inventory-ledger): 旧退料夹具和手写无来源流水用例已移除；正式测试阶段
// 通过现行公共单据补回余额投影、批次状态变化、负库存拒绝及盘点审计失败整单回滚覆盖。
