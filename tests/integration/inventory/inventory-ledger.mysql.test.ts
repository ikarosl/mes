import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  type Pool,
  type RowDataPacket,
  type PoolConnection,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as materialFixtures from '../production/materials/material-test-fixture.js';
import { type MysqlInventoryStockCheckRepository } from '../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-stock-check.repository.js';
import * as returnLossFixtures from '../production/materials/return-loss-test-fixture.js';

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

describeMysql('Inventory ledger balances and stock-check rollback MySQL transactions', () => {
  const { createFixture, cleanup, context } = returnLossFixtures;
  let pool: Pool;
  let stockCheckRepository: MysqlInventoryStockCheckRepository;
  let actorId: number;
  let actorUsername: string;

  beforeAll(async () => {
    ({ pool, stockCheckRepository, actorId, actorUsername } =
      await returnLossFixtures.createReturnLossTestContext(
        (createdPool) => {
          pool = createdPool;
        },
        (createdActorUsername) => {
          actorUsername = createdActorUsername;
        },
      ));
  });

  afterAll(async () => {
    if (pool && actorUsername)
      await pool.execute('DELETE FROM users WHERE username=?', [actorUsername]);
    await pool?.end();
  });

  it('keeps batch and exact-variant balances atomic across ledger writes and status moves', async () => {
    const fixture = await createFixture(pool, actorId);
    const loadBalances = async () => {
      const [[batch]] = await pool.query<(RowDataPacket & { current_quantity: string | number })[]>(
        `SELECT current_quantity
         FROM inventory_batch_balance
         WHERE batch_id=? AND stock_status='available'`,
        [fixture.itemBatchId],
      );
      const [variants] = await pool.query<
        (RowDataPacket & { batch_status: string; current_quantity: string | number })[]
      >(
        `SELECT batch_status,current_quantity
         FROM inventory_material_variant_balance
         WHERE material_variant_id=? AND material_id=? AND stock_status='available'
         ORDER BY batch_status`,
        [fixture.materialVariantId, fixture.materialId],
      );
      return {
        batchQuantity: Number(batch?.current_quantity ?? 0),
        variants: variants.map((row) => ({
          batchStatus: row.batch_status,
          quantity: Number(row.current_quantity),
        })),
      };
    };
    const insertLedger = async (
      connection: PoolConnection,
      quantity: number,
      idempotencyKey: string,
    ) =>
      connection.execute(
        `INSERT INTO inventory_transaction
         (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,
          stock_status,reference_type,reference_detail_id,idempotency_key,created_by)
         VALUES (?,?,?,'purchase_inbound',?,'kg','available','manual',0,?,?)`,
        [
          fixture.materialId,
          fixture.materialVariantId,
          fixture.itemBatchId,
          quantity,
          idempotencyKey,
          actorId,
        ],
      );

    try {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await insertLedger(connection, 3, `${fixture.token}-balance-positive`);
        await insertLedger(connection, -2, `${fixture.token}-balance-negative`);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      expect(await loadBalances()).toEqual({
        batchQuantity: 6,
        variants: [{ batchStatus: 'available', quantity: 6 }],
      });

      const [[negativeBatch]] = await pool.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) count FROM inventory_batch_balance
         WHERE batch_id=? AND current_quantity<0`,
        [fixture.itemBatchId],
      );
      const [[negativeVariant]] = await pool.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) count FROM inventory_material_variant_balance
         WHERE material_variant_id=? AND material_id=? AND current_quantity<0`,
        [fixture.materialVariantId, fixture.materialId],
      );
      expect(Number(negativeBatch?.count)).toBe(0);
      expect(Number(negativeVariant?.count)).toBe(0);

      const pendingCheck = await stockCheckRepository.createStockCheck(
        {
          details: [{ itemBatchId: String(fixture.itemBatchId), stockStatus: 'available' }],
        },
        context(actorId, `${fixture.token}-balance-rollback-check-create`),
      );
      const counted = await stockCheckRepository.saveStockCheckCounts(
        pendingCheck.id,
        {
          version: pendingCheck.version,
          details: [{ detailId: pendingCheck.details[0]!.id, actualQuantity: 5 }],
        },
        context(actorId, `${fixture.token}-balance-rollback-check-count`),
      );

      await pool.execute(`UPDATE item_batch SET batch_status='frozen',updated_by=? WHERE id=?`, [
        actorId,
        fixture.itemBatchId,
      ]);
      expect(await loadBalances()).toEqual({
        batchQuantity: 6,
        variants: [{ batchStatus: 'frozen', quantity: 6 }],
      });

      const [[beforeRejectedWrite]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM inventory_transaction WHERE batch_id=?',
        [fixture.itemBatchId],
      );
      await expect(
        insertLedger(
          pool as unknown as PoolConnection,
          -7,
          `${fixture.token}-balance-rejected-negative`,
        ),
      ).rejects.toBeDefined();
      const [[afterRejectedWrite]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM inventory_transaction WHERE batch_id=?',
        [fixture.itemBatchId],
      );
      expect(Number(afterRejectedWrite?.count)).toBe(Number(beforeRejectedWrite?.count));
      expect(await loadBalances()).toEqual({
        batchQuantity: 6,
        variants: [{ batchStatus: 'frozen', quantity: 6 }],
      });

      await expect(
        stockCheckRepository.completeStockCheck(
          counted.id,
          counted.version,
          context(actorId, 'x'.repeat(500)),
        ),
      ).rejects.toBeDefined();
      const [[afterAuditRollback]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM inventory_transaction WHERE batch_id=?',
        [fixture.itemBatchId],
      );
      expect(Number(afterAuditRollback?.count)).toBe(Number(beforeRejectedWrite?.count));
      expect(await loadBalances()).toEqual({
        batchQuantity: 6,
        variants: [{ batchStatus: 'frozen', quantity: 6 }],
      });
      const [[stockCheck]] = await pool.query<
        (RowDataPacket & { status: string; version: number })[]
      >('SELECT status,version FROM stock_check_order WHERE id=?', [pendingCheck.id]);
      expect(stockCheck).toMatchObject({ status: 'counting', version: counted.version });
      const [[detail]] = await pool.query<(RowDataPacket & { adjusted: number })[]>(
        'SELECT adjusted FROM stock_check_detail WHERE id=?',
        [pendingCheck.details[0]!.id],
      );
      expect(detail?.adjusted).toBe(0);
    } finally {
      await cleanup(pool, fixture);
    }
  });
});
