import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import { type Pool, type RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MysqlIdempotencyExecutor } from '../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';
import { IdentityDirectoryService } from '../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductSnapshotService } from '../../../apps/api/src/modules/product/application/product-snapshot.service.js';
import { MysqlProductSnapshotRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import { ProductionInboundService } from '../../../apps/api/src/modules/production/application/production-inbound.service.js';
import { MysqlInventoryInboundRepository } from '../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-inbound.repository.js';
import { type MysqlMaterialVariantRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-material-variant.repository.js';
import * as materialFixtures from '../production/materials/material-test-fixture.js';

// Historical manual purchase-inbound scenario, preserved without contract migration.
// The current Procurement receipt/Quality/Inventory flow has replaced this write API;
// the old service calls and assertions below intentionally retain the existing stale contract.
loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Legacy manual purchase inbound MySQL transactions (unmigrated contract)', () => {
  const { fixture, cleanup, deleteInventoryTransactions, ctx, idemCtx } = materialFixtures;
  let pool: Pool;
  let materialVariants: MysqlMaterialVariantRepository;
  let actorId: number;

  beforeAll(async () => {
    ({ pool, materialVariants, actorId } = await materialFixtures.createMaterialTestContext(
      (createdPool) => {
        pool = createdPool;
      },
    ));
  });

  afterAll(async () => pool?.end());

  it('creates pending purchase inbound without stock, confirms once, and cancels without ledger', async () => {
    const f = await fixture(pool, actorId, 'inbound');
    const inboundService = new ProductionInboundService(
      new MysqlInventoryInboundRepository(pool, materialVariants),
      new ProductSnapshotService(new MysqlProductSnapshotRepository(pool)),
      materialVariants,
      new IdentityDirectoryService(new MysqlRbacRepository(pool)),
      new MysqlIdempotencyExecutor(pool),
    );
    const inboundIds: string[] = [];
    const batchCodes = [
      `${f.token}-purchase-a`,
      `${f.token}-purchase-b`,
      `${f.token}-cancel`,
      `${f.token}-rollback`,
    ];
    try {
      const created = await inboundService.create(
        {
          inboundNo: `${f.token}-PI1`,
          provider: '供应商',
          details: [
            {
              itemId: String(f.materialId),
              materialVariantId: String(f.materialVariant1Id),
              batchCode: batchCodes[0]!,
              inboundQuantity: 7,
            },
            {
              itemId: String(f.materialId),
              materialVariantId: String(f.materialVariant1Id),
              batchCode: batchCodes[1]!,
              inboundQuantity: 5,
            },
          ],
        },
        idemCtx(actorId, `${f.token}-create`, `${f.token}-create-key`),
      );
      inboundIds.push(created.inboundId);
      expect(created.status).toBe('pending');
      expect(created.details).toHaveLength(2);
      expect(created.details.every((detail) => detail.inventoryTransactionId === null)).toBe(true);
      const createReplay = await inboundService.create(
        {
          inboundNo: `${f.token}-PI1`,
          provider: '供应商',
          details: [
            {
              itemId: String(f.materialId),
              materialVariantId: String(f.materialVariant1Id),
              batchCode: batchCodes[0]!,
              inboundQuantity: 7,
            },
            {
              itemId: String(f.materialId),
              materialVariantId: String(f.materialVariant1Id),
              batchCode: batchCodes[1]!,
              inboundQuantity: 5,
            },
          ],
        },
        idemCtx(actorId, `${f.token}-create-replay`, `${f.token}-create-key`),
      );
      expect(createReplay).toEqual(created);
      const [[pendingLedger]] = await pool.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) count FROM inventory_transaction WHERE reference_type='inbound_detail' AND reference_detail_id IN (${created.details.map(() => '?').join(',')})`,
        created.details.map((detail) => detail.id),
      );
      expect(Number(pendingLedger?.count)).toBe(0);
      const [confirmed, concurrentReplay] = await Promise.all([
        inboundService.confirm(
          created.inboundId,
          0,
          idemCtx(actorId, `${f.token}-confirm`, `${f.token}-confirm-key`),
        ),
        inboundService.confirm(
          created.inboundId,
          0,
          idemCtx(actorId, `${f.token}-confirm-concurrent`, `${f.token}-confirm-key-2`),
        ),
      ]);
      expect(concurrentReplay).toEqual(confirmed);
      const replay = await inboundService.confirm(
        created.inboundId,
        0,
        idemCtx(actorId, `${f.token}-confirm-replay`, `${f.token}-confirm-key`),
      );
      expect(replay).toEqual(confirmed);
      const [[ledger]] = await pool.query<(RowDataPacket & { count: number; quantity: string })[]>(
        `SELECT COUNT(*) count,SUM(quantity) quantity FROM inventory_transaction WHERE reference_type='inbound_detail' AND reference_detail_id IN (${confirmed.details.map(() => '?').join(',')})`,
        confirmed.details.map((detail) => detail.id),
      );
      expect(Number(ledger?.count)).toBe(2);
      expect(Number(ledger?.quantity)).toBe(12);
      await expect(
        inboundService.cancel(
          created.inboundId,
          confirmed.version,
          '测试取消',
          ctx(actorId, `${f.token}-bad-cancel`),
        ),
      ).rejects.toMatchObject({ code: 'INBOUND_CANCEL_NOT_ALLOWED' });
      const pending = await inboundService.create(
        {
          inboundNo: `${f.token}-PI2`,
          details: [
            {
              itemId: String(f.materialId),
              materialVariantId: String(f.materialVariant1Id),
              batchCode: batchCodes[2]!,
              inboundQuantity: 3,
            },
          ],
        },
        idemCtx(actorId, `${f.token}-cancel-create`, `${f.token}-cancel-create-key`),
      );
      inboundIds.push(pending.inboundId);
      const cancelled = await inboundService.cancel(
        pending.inboundId,
        0,
        '测试取消',
        ctx(actorId, `${f.token}-cancel`),
      );
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancelReason: '测试取消',
        cancelledById: String(actorId),
      });
      const [[cancelLedger]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM inventory_transaction WHERE reference_type='inbound_detail' AND reference_detail_id=?",
        [pending.details[0]!.id],
      );
      expect(Number(cancelLedger?.count)).toBe(0);
      const rollback = await inboundService.create(
        {
          inboundNo: `${f.token}-PI3`,
          details: [
            {
              itemId: String(f.materialId),
              materialVariantId: String(f.materialVariant1Id),
              batchCode: batchCodes[3]!,
              inboundQuantity: 4,
            },
          ],
        },
        idemCtx(actorId, `${f.token}-rollback-create`, `${f.token}-rollback-create-key`),
      );
      inboundIds.push(rollback.inboundId);
      await expect(
        inboundService.confirm(
          rollback.inboundId,
          0,
          idemCtx(actorId, 'x'.repeat(500), `${f.token}-rollback-confirm-key`),
        ),
      ).rejects.toBeDefined();
      const afterRollback = await inboundService.get(rollback.inboundId);
      expect(afterRollback).toMatchObject({ status: 'pending', version: 0 });
      expect(afterRollback.details[0]?.inventoryTransactionId).toBeNull();
    } finally {
      if (inboundIds.length) {
        await deleteInventoryTransactions(
          pool,
          `DELETE FROM inventory_transaction WHERE reference_type='inbound_detail' AND reference_detail_id IN (SELECT id FROM inbound_detail WHERE inbound_id IN (${inboundIds.map(() => '?').join(',')}))`,
          inboundIds,
        );
        await pool.execute(
          `DELETE FROM inbound_detail WHERE inbound_id IN (${inboundIds.map(() => '?').join(',')})`,
          inboundIds,
        );
        await pool.execute(
          `DELETE FROM inbound_order WHERE id IN (${inboundIds.map(() => '?').join(',')})`,
          inboundIds,
        );
      }
      await pool.execute('DELETE FROM item_batch WHERE batch_code IN (?,?,?,?)', batchCodes);
      await cleanup(pool, f);
    }
  });
});
