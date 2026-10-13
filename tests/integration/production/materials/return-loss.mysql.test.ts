import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import { type Pool, type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type MysqlProductionMaterialLossRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material-loss.repository.js';
import { type MysqlProductionReturnRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-return.repository.js';
import { type MysqlInventoryStockCheckRepository } from '../../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-stock-check.repository.js';
import * as returnLossFixtures from './return-loss-test-fixture.js';

// The return-plus-stock-check scenario remains one complete cross-module test.
loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production return and material loss MySQL transactions', () => {
  const { createFixture, cleanup, context } = returnLossFixtures;
  let pool: Pool;
  let returnRepository: MysqlProductionReturnRepository;
  let stockCheckRepository: MysqlInventoryStockCheckRepository;
  let lossRepository: MysqlProductionMaterialLossRepository;
  let actorId: number;
  let actorUsername: string;

  beforeAll(async () => {
    ({ pool, returnRepository, stockCheckRepository, lossRepository, actorId, actorUsername } =
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

  it('returns confirmed material and completes a stock check with one atomic adjustment', async () => {
    const fixture = await createFixture(pool, actorId);
    try {
      const candidates = await returnRepository.listReturnCandidates(
        String(fixture.productionBatchId),
      );
      expect(candidates).toHaveLength(1);
      expect(Number(candidates[0]?.returnableQuantity)).toBe(5);

      const pendingReturn = await returnRepository.createReturnOrder(
        {
          productionBatchId: String(fixture.productionBatchId),
          details: [{ allocationId: String(fixture.allocationId), returnQuantity: 3 }],
        },
        context(actorId, `${fixture.token}-return-create`),
      );
      expect(pendingReturn.status).toBe('pending');
      expect(pendingReturn.details[0]?.returnStockStatus).toBe('available');
      expect(pendingReturn.details[0]?.releaseAfterReturn).toBe(true);

      const confirmedReturn = await returnRepository.confirmReturnOrder(
        pendingReturn.id,
        pendingReturn.version,
        context(actorId, `${fixture.token}-return-confirm`),
      );
      expect(confirmedReturn.status).toBe('returned');
      const [[returnLedger]] = await pool.query<
        (RowDataPacket & { quantity: string; count: number })[]
      >(
        "SELECT SUM(quantity) quantity,COUNT(*) count FROM inventory_transaction WHERE reference_type='return_detail' AND reference_detail_id=?",
        [confirmedReturn.details[0]!.id],
      );
      expect(Number(returnLedger?.quantity)).toBe(3);
      expect(Number(returnLedger?.count)).toBe(1);

      const pendingCheck = await stockCheckRepository.createStockCheck(
        {
          details: [{ itemBatchId: String(fixture.itemBatchId), stockStatus: 'available' }],
        },
        context(actorId, `${fixture.token}-check-create`),
      );
      expect(Number(pendingCheck.details[0]?.systemQuantity)).toBe(8);
      const counted = await stockCheckRepository.saveStockCheckCounts(
        pendingCheck.id,
        {
          version: pendingCheck.version,
          details: [{ detailId: pendingCheck.details[0]!.id, actualQuantity: 7 }],
        },
        context(actorId, `${fixture.token}-check-count`),
      );
      expect(counted.status).toBe('counting');
      expect(counted.details[0]?.result).toBe('shortage');

      const completed = await stockCheckRepository.completeStockCheck(
        counted.id,
        counted.version,
        context(actorId, `${fixture.token}-check-complete`),
      );
      expect(completed.status).toBe('completed');
      expect(completed.details[0]?.adjusted).toBe(true);
      const [[balance]] = await pool.query<(RowDataPacket & { quantity: string })[]>(
        "SELECT SUM(quantity) quantity FROM inventory_transaction WHERE batch_id=? AND stock_status='available'",
        [fixture.itemBatchId],
      );
      expect(Number(balance?.quantity)).toBe(7);
      const [[audit]] = await pool.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) count FROM operation_logs
         WHERE request_id LIKE ? AND action IN ('production-return.confirm','production-stock-check.complete')`,
        [`${fixture.token}-%`],
      );
      expect(Number(audit?.count)).toBe(2);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('preserves demand and confirmed outbound facts while returning surplus before start', async () => {
    const fixture = await createFixture(pool, actorId);
    try {
      await pool.execute(
        "UPDATE production_batches SET status='material_partially_outbound' WHERE id=?",
        [fixture.productionBatchId],
      );
      await pool.execute(
        `UPDATE production_item_demand
         SET remaining_number=5,business_status='active'
         WHERE id=?`,
        [fixture.demandId],
      );
      const pendingReturn = await returnRepository.createReturnOrder(
        {
          productionBatchId: String(fixture.productionBatchId),
          details: [{ allocationId: String(fixture.allocationId), returnQuantity: 5 }],
        },
        context(actorId, `${fixture.token}-return-create`),
      );

      await returnRepository.confirmReturnOrder(
        pendingReturn.id,
        pendingReturn.version,
        context(actorId, `${fixture.token}-return-confirm`),
      );

      const [[batch]] = await pool.query<(RowDataPacket & { version: number })[]>(
        'SELECT version FROM production_batches WHERE id=?',
        [fixture.productionBatchId],
      );
      expect(batch?.version).toBe(0);
      const [[demand]] = await pool.query<
        (RowDataPacket & { remaining_number: string; business_status: string })[]
      >('SELECT remaining_number,business_status FROM production_item_demand WHERE id=?', [
        fixture.demandId,
      ]);
      expect(Number(demand?.remaining_number)).toBe(5);
      expect(demand?.business_status).toBe('active');
      const [[outboundFacts]] = await pool.query<(RowDataPacket & { quantity: string | number })[]>(
        `SELECT COALESCE(-SUM(quantity),0) quantity
         FROM inventory_transaction
         WHERE batch_id=? AND transaction_type='production_material_outbound'`,
        [fixture.itemBatchId],
      );
      expect(Number(outboundFacts?.quantity)).toBe(5);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('confirms a material loss without creating demand or stock movement', async () => {
    const fixture = await createFixture(pool, actorId);
    try {
      await pool.execute(
        "UPDATE production_batches SET status='material_partially_outbound' WHERE id=?",
        [fixture.productionBatchId],
      );
      const options = await lossRepository.listMaterialLossBatchOptions();
      expect(options).toContainEqual(
        expect.objectContaining({
          productionBatchId: String(fixture.productionBatchId),
          batchStatus: 'material_partially_outbound',
        }),
      );
      const [[beforeBatch]] = await pool.query<(RowDataPacket & { version: number })[]>(
        'SELECT version FROM production_batches WHERE id=?',
        [fixture.productionBatchId],
      );
      const created = await lossRepository.createMaterialLoss(
        {
          productionBatchId: String(fixture.productionBatchId),
          allocationId: String(fixture.allocationId),
          scrapQuantity: 2,
          reasonType: '现场损耗',
          remark: '仅确认损耗记录',
        },
        context(actorId, `${fixture.token}-loss-create`),
      );
      expect(created).toMatchObject({ status: 'pending', scrapQuantity: '2' });

      const confirmed = await lossRepository.confirmMaterialLoss(
        created.id,
        created.version,
        context(actorId, `${fixture.token}-loss-confirm`),
      );
      expect(confirmed).toMatchObject({
        status: 'confirmed',
        version: 1,
        purpose: 'production_record',
        scrapQuantity: '2',
      });
      const [[demandCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=?',
        [fixture.productionBatchId],
      );
      expect(Number(demandCount?.count)).toBe(1);
      const [[lossFact]] = await pool.query<
        (RowDataPacket & { loss_purpose: string; status: string; scrap_number: string })[]
      >('SELECT loss_purpose,status,scrap_number FROM item_scrap WHERE id=?', [confirmed.id]);
      expect(lossFact).toMatchObject({
        loss_purpose: 'production_record',
        status: 'confirmed',
      });
      expect(Number(lossFact?.scrap_number)).toBe(2);
      const [[inventoryFacts]] = await pool.query<
        (RowDataPacket & { quantity: string | number; count: number })[]
      >(
        'SELECT SUM(quantity) quantity,COUNT(*) count FROM inventory_transaction WHERE batch_id=?',
        [fixture.itemBatchId],
      );
      expect(Number(inventoryFacts?.quantity)).toBe(5);
      expect(Number(inventoryFacts?.count)).toBe(2);
      const [[batch]] = await pool.query<(RowDataPacket & { version: number })[]>(
        'SELECT version FROM production_batches WHERE id=?',
        [fixture.productionBatchId],
      );
      expect(batch?.version).toBe(beforeBatch!.version);
    } finally {
      await cleanup(pool, fixture);
    }
  });
});
