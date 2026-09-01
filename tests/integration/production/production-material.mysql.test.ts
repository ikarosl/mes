import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MysqlIdempotencyExecutor } from '../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';
import { IdentityDirectoryService } from '../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductSnapshotService } from '../../../apps/api/src/modules/product/application/product-snapshot.service.js';
import { MysqlProductSnapshotRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import { ProductionMaterialService } from '../../../apps/api/src/modules/production/application/production-material.service.js';
import { MysqlProductionMaterialRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-material.repository.js';
import { evaluateShortBatchStart } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-short-batch.js';
import { MysqlProductionTraceRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-trace.repository.js';
import { ProductionInboundService } from '../../../apps/api/src/modules/production/application/production-inbound.service.js';
import { MysqlProductionInboundRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-inbound.repository.js';
import { MysqlProductionSupplyDemandRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-supply-demand.repository.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production material MySQL transactions', () => {
  let pool: Pool;
  let repository: MysqlProductionMaterialRepository;
  let service: ProductionMaterialService;
  let actorId: number;
  beforeAll(async () => {
    const database = req('DB_NAME');
    if (!/(?:_test|_ci)$/.test(database)) {
      throw new Error(
        'production material integration tests require a dedicated *_test or *_ci database',
      );
    }
    pool = createPool({
      host: req('DB_HOST'),
      port: Number(req('DB_PORT')),
      user: req('DB_USER'),
      password: req('DB_PASSWORD'),
      database,
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 6,
    });
    repository = new MysqlProductionMaterialRepository(pool);
    service = new ProductionMaterialService(
      repository,
      new IdentityDirectoryService(new MysqlRbacRepository(pool)),
      new ProductSnapshotService(new MysqlProductSnapshotRepository(pool)),
      new MysqlIdempotencyExecutor(pool),
    );
    const [[actor]] = await pool.query<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM users ORDER BY id LIMIT 1',
    );
    if (!actor) throw new Error('seeded user required');
    actorId = actor.id;
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

  it('allocates, releases without deleting facts, and recomputes the batch material state', async () => {
    const f = await fixture(pool, actorId, 'release');
    try {
      const created = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 10,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      expect(created.batchStatus).toBe('material_assigned');
      const released = await repository.releaseAllocation(
        String(f.batchId),
        created.allocations[0]!.allocationId,
        0,
        ctx(actorId, f.token),
      );
      expect(released.allocationStatus).toBe('released');
      const [[batch]] = await pool.query<(RowDataPacket & { status: string })[]>(
        'SELECT status FROM production_batches WHERE id=?',
        [f.batchId],
      );
      expect(batch?.status).toBe('material_pending');
    } finally {
      await cleanup(pool, f);
    }
  });

  it('keeps the normal outbound gate, then permits only an explicitly authorized short batch', async () => {
    const f = await fixture(pool, actorId, 'short-batch');
    try {
      const allocated = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 6,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      await expect(
        repository.createOutbound(
          String(f.batchId),
          {
            details: [
              { allocationId: allocated.allocations[0]!.allocationId, outboundQuantity: 6 },
            ],
          },
          ctx(actorId, `${f.token}-blocked`),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });

      const preview = await repository.getShortBatchAuthorizationPreview(String(f.batchId));
      expect(preview).toMatchObject({ canAuthorize: true, materialPlanVersion: 1 });
      expect(preview.lines[0]).toMatchObject({
        expectedOutboundQuantity: '6.0000',
        authorizedRemainingQuantity: '4.0000',
      });
      const authorization = await repository.authorizeShortBatch(
        String(f.batchId),
        preview.batchVersion,
        '允许已到料部分先行生产',
        ctx(actorId, `${f.token}-authorize`),
      );
      expect(authorization.lines[0]?.authorizedRemainingQuantity).toBe('4.0000');

      const outbound = await repository.createOutbound(
        String(f.batchId),
        {
          details: [{ allocationId: allocated.allocations[0]!.allocationId, outboundQuantity: 6 }],
        },
        ctx(actorId, `${f.token}-outbound`),
      );
      expect(outbound.outbound.shortBatchAuthorizationId).toBe(authorization.authorizationId);
      const confirmed = await repository.confirmOutbound(
        outbound.outbound.outboundId,
        outbound.outbound.version,
        ctx(actorId, `${f.token}-confirm`),
      );
      expect(confirmed.batchStatus).toBe('material_partially_outbound');
      const [[detail]] = await pool.query<
        (RowDataPacket & { authorized_remaining_quantity: string })[]
      >(
        `SELECT authorized_remaining_quantity
         FROM production_short_batch_authorization_detail
         WHERE authorization_id=? AND demand_id=?`,
        [authorization.authorizationId, f.demandId],
      );
      expect(Number(detail?.authorized_remaining_quantity)).toBe(4);
      await expect(
        evaluateShortBatchStart(pool, String(f.batchId), authorization.materialPlanVersion),
      ).resolves.toMatchObject({
        authorizationId: authorization.authorizationId,
        canStart: true,
        blockedReason: null,
      });

      await pool.execute(
        `UPDATE production_batches
         SET material_plan_version=material_plan_version+1,version=version+1
         WHERE id=?`,
        [f.batchId],
      );
      await expect(
        evaluateShortBatchStart(pool, String(f.batchId), authorization.materialPlanVersion + 1),
      ).resolves.toMatchObject({
        authorizationId: null,
        canStart: false,
      });

      const renewedPreview = await repository.getShortBatchAuthorizationPreview(String(f.batchId));
      expect(renewedPreview).toMatchObject({
        canAuthorize: true,
        authorizationStatus: 'stale',
        materialPlanVersion: 2,
      });
      const renewed = await repository.authorizeShortBatch(
        String(f.batchId),
        renewedPreview.batchVersion,
        '需求计划变化后重新复核',
        ctx(actorId, `${f.token}-reauthorize`),
      );
      await pool.execute(
        `UPDATE production_short_batch_authorization
         SET status='consumed',used_at=NOW(),version=version+1
         WHERE id=? AND status='active'`,
        [renewed.authorizationId],
      );
      await pool.execute(
        `UPDATE production_batches
         SET status='doing',version=version+1
         WHERE id=? AND status='material_partially_outbound'`,
        [f.batchId],
      );
      const continuedAllocation = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch2),
              assignedQuantity: 1,
            },
          ],
        },
        ctx(actorId, `${f.token}-continued-allocation`),
      );
      const candidates = await repository.listOutboundCandidates(String(f.batchId));
      expect(candidates.map((row) => row.allocationId)).toContain(
        continuedAllocation.allocations[0]!.allocationId,
      );
      const options = await repository.listOutboundBatchOptions();
      expect(options.map((row) => row.productionBatchId)).toContain(String(f.batchId));
      const continuedOutbound = await repository.createOutbound(
        String(f.batchId),
        {
          details: [
            {
              allocationId: continuedAllocation.allocations[0]!.allocationId,
              outboundQuantity: 1,
            },
          ],
        },
        ctx(actorId, `${f.token}-continued-outbound`),
      );
      await repository.cancelOutbound(
        continuedOutbound.outbound.outboundId,
        continuedOutbound.outbound.version,
        '关闭剩余需求前取消待出库单',
        ctx(actorId, `${f.token}-continued-outbound-cancel`),
      );
      const closed = await repository.closeRemainingDemands(
        String(f.batchId),
        renewed.batchVersion + 1,
        '按短批实际产量关闭余量',
        ctx(actorId, `${f.token}-close-remaining`),
      );
      expect(closed).toMatchObject({
        batchStatus: 'doing',
        cancelledDemandCount: 1,
        materialPlanVersion: 3,
      });
      const [[cancelledDemand]] = await pool.query<
        (RowDataPacket & { cancel_source: string; cancel_reason: string })[]
      >(
        `SELECT cancel_source,cancel_reason FROM production_item_demand
         WHERE id=? AND business_status='cancelled'`,
        [f.demandId],
      );
      expect(cancelledDemand).toMatchObject({
        cancel_source: 'short_batch_remaining_close',
        cancel_reason: '按短批实际产量关闭余量',
      });
    } finally {
      await cleanup(pool, f);
    }
  });

  it('creates one pending multi-line order without stock deduction, then confirms it atomically', async () => {
    const f = await fixture(pool, actorId, 'outbound');
    try {
      const allocated = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 4,
            },
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch2),
              assignedQuantity: 6,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      const result = await repository.createOutbound(
        String(f.batchId),
        {
          details: allocated.allocations.map((row) => ({
            allocationId: row.allocationId,
            outboundQuantity: Number(row.assignedQuantity),
          })),
        },
        ctx(actorId, f.token),
      );
      expect(result.batchStatus).toBe('material_assigned');
      expect(result.outbound.status).toBe('pending_picking');
      expect(result.outbound.outboundAt).toBeNull();
      const [[ledger]] = await pool.query<(RowDataPacket & { quantity: string; count: number })[]>(
        "SELECT SUM(quantity) quantity,COUNT(*) count FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE outbound_id=?)",
        [result.outbound.outboundId],
      );
      expect(Number(ledger?.count)).toBe(0);
      const demandsWhilePending = await repository.listDemands(String(f.batchId));
      expect(Number(demandsWhilePending[0]?.outboundQuantity)).toBe(0);
      expect(Number(demandsWhilePending[0]?.allocations[0]?.pendingOutboundQuantity)).toBe(4);
      const supplyDemand = new MysqlProductionSupplyDemandRepository(pool);
      const supplyBeforeConfirm = await supplyDemand.list({
        keyword: f.token + '-m',
        page: 1,
        pageSize: 20,
      });
      expect(supplyBeforeConfirm.items[0]).toMatchObject({
        itemId: String(f.materialId),
        availableInventoryQuantity: '20',
        openDemandQuantity: '10',
        shortageQuantity: '0',
        isShortage: false,
      });
      const demandTraceBeforeConfirm = await supplyDemand.listDemandTrace(String(f.materialId), {
        page: 1,
        pageSize: 20,
      });
      expect(demandTraceBeforeConfirm.items).toContainEqual(
        expect.objectContaining({
          demandId: String(f.demandId),
          productionBatchId: String(f.batchId),
          demandType: 'normal',
          demandQuantity: '10.0000',
          remainingDemandQuantity: '10',
          supplementId: null,
        }),
      );
      const confirmed = await repository.confirmOutbound(
        result.outbound.outboundId,
        0,
        ctx(actorId, `${f.token}-confirm`),
      );
      expect(confirmed.batchStatus).toBe('material_outbound');
      expect(confirmed.outbound.status).toBe('completed');
      const [[confirmedLedger]] = await pool.query<
        (RowDataPacket & { quantity: string; count: number })[]
      >(
        "SELECT SUM(quantity) quantity,COUNT(*) count FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE outbound_id=?)",
        [result.outbound.outboundId],
      );
      expect(Number(confirmedLedger?.quantity)).toBe(-10);
      expect(Number(confirmedLedger?.count)).toBe(2);
      const [[fulfilledDemand]] = await pool.query<
        (RowDataPacket & { business_status: string; remaining_number: string })[]
      >('SELECT business_status,remaining_number FROM production_item_demand WHERE id=?', [
        f.demandId,
      ]);
      expect(fulfilledDemand).toMatchObject({
        business_status: 'fulfilled',
        remaining_number: 0,
      });
      const [[materialBalance]] = await pool.query<
        (RowDataPacket & { current_quantity: string })[]
      >(
        `SELECT current_quantity FROM inventory_item_balance
         WHERE item_id=? AND stock_status='available' AND batch_status='available'`,
        [f.materialId],
      );
      expect(Number(materialBalance?.current_quantity)).toBe(10);
      const supplyAfterConfirm = await supplyDemand.list({
        keyword: f.token + '-m',
        page: 1,
        pageSize: 20,
      });
      expect(supplyAfterConfirm.items).toHaveLength(0);
      const [[audit]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM operation_logs WHERE request_id=? AND action='production-material.outbound.create'",
        [f.token],
      );
      expect(Number(audit?.count)).toBe(1);
      const trace = new MysqlProductionTraceRepository(pool);
      const byInventoryBatch = await trace.search({
        keyword: `${f.token}-ib1`,
        page: 1,
        pageSize: 20,
      });
      expect(
        byInventoryBatch.items.flatMap((item) =>
          item.batches.map((batch) => batch.productionBatchId),
        ),
      ).toContain(String(f.batchId));
      const transactions = await trace.listInventoryTransactions(String(f.batchId));
      expect(transactions).toHaveLength(2);
      expect(transactions.every((transaction) => Number(transaction.quantity) < 0)).toBe(true);
      expect(transactions.map((transaction) => transaction.outboundDetailId).sort()).toEqual(
        result.outbound.details.map((detail) => detail.id).sort(),
      );
    } finally {
      await cleanup(pool, f);
    }
  });

  it('serializes competing allocations on one inventory batch and prevents over-allocation', async () => {
    const a = await fixture(pool, actorId, 'race-a');
    const b = await fixture(pool, actorId, 'race-b', {
      sharedItemId: a.materialId,
      sharedCategoryId: a.materialCategoryId,
      sharedItemBatchId: a.itemBatch1,
    });
    try {
      const results = await Promise.allSettled([
        repository.createAllocations(
          String(a.batchId),
          {
            allocations: [
              {
                demandId: String(a.demandId),
                itemBatchId: String(a.itemBatch1),
                assignedQuantity: 8,
              },
            ],
          },
          ctx(actorId, a.token),
        ),
        repository.createAllocations(
          String(b.batchId),
          {
            allocations: [
              {
                demandId: String(b.demandId),
                itemBatchId: String(a.itemBatch1),
                assignedQuantity: 8,
              },
            ],
          },
          ctx(actorId, b.token),
        ),
      ]);
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    } finally {
      await cleanup(pool, b);
      await cleanup(pool, a);
    }
  });

  it('serializes competing pending orders and restores orderable quantity after cancellation', async () => {
    const f = await fixture(pool, actorId, 'outbound-order-race');
    try {
      const allocation = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 10,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      const payload = {
        details: [{ allocationId: allocation.allocations[0]!.allocationId, outboundQuantity: 10 }],
      };
      const results = await Promise.allSettled([
        repository.createOutbound(String(f.batchId), payload, ctx(actorId, `${f.token}-a`)),
        repository.createOutbound(String(f.batchId), payload, ctx(actorId, `${f.token}-b`)),
      ]);
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
      const created = results.find((row) => row.status === 'fulfilled');
      if (!created || created.status !== 'fulfilled') throw new Error('pending order required');
      const beforeCancel = await repository.listOutboundCandidates(String(f.batchId));
      expect(beforeCancel).toHaveLength(0);
      const cancelledOutbound = await repository.cancelOutbound(
        created.value.outbound.outboundId,
        created.value.outbound.version,
        '测试取消',
        ctx(actorId, `${f.token}-cancel`),
      );
      expect(cancelledOutbound).toMatchObject({
        status: 'cancelled',
        cancelSource: 'manual',
        cancelReason: '测试取消',
        cancelledById: String(actorId),
      });
      const afterCancel = await repository.listOutboundCandidates(String(f.batchId));
      expect(Number(afterCancel[0]?.availableToOrderQuantity)).toBe(10);
      const [[ledger]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE outbound_id=?)",
        [created.value.outbound.outboundId],
      );
      expect(Number(ledger?.count)).toBe(0);
    } finally {
      await cleanup(pool, f);
    }
  });

  it('keeps a pending order intact when aggregate stock validation fails during confirmation', async () => {
    const f = await fixture(pool, actorId, 'outbound-aggregate');
    try {
      const first = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 5,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      const second = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 5,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      await pool.execute(
        "INSERT INTO inventory_transaction (item_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,'production_material_outbound','-2.0000','kg','available','manual',0,?,?)",
        [f.materialId, f.itemBatch1, `${f.token}-external-outbound`, actorId],
      );

      const pending = await repository.createOutbound(
        String(f.batchId),
        {
          details: [
            { allocationId: first.allocations[0]!.allocationId, outboundQuantity: 5 },
            { allocationId: second.allocations[0]!.allocationId, outboundQuantity: 5 },
          ],
        },
        ctx(actorId, f.token),
      );
      await expect(
        repository.confirmOutbound(pending.outbound.outboundId, 0, ctx(actorId, f.token)),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_AVAILABLE_STOCK' });
      const [[outboundCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM outbound_order WHERE production_batch_id=? AND status='pending_picking'",
        [f.batchId],
      );
      expect(Number(outboundCount?.count)).toBe(1);
      const [[ledgerCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE outbound_id=?)",
        [pending.outbound.outboundId],
      );
      expect(Number(ledgerCount?.count)).toBe(0);
    } finally {
      await cleanup(pool, f);
    }
  });

  it('replays allocation after a lost response, rejects key reuse with a different payload, and rolls back failed business writes', async () => {
    const f = await fixture(pool, actorId, 'allocation-idempotency');
    try {
      const key = `${f.token}-allocation-key`;
      const payload = {
        allocations: [
          { demandId: String(f.demandId), itemBatchId: String(f.itemBatch1), assignedQuantity: 4 },
        ],
      };
      const first = await service.createAllocations(
        String(f.batchId),
        payload,
        idemCtx(actorId, `${f.token}-first`, key),
      );
      const replay = await service.createAllocations(
        String(f.batchId),
        payload,
        idemCtx(actorId, `${f.token}-replay`, key),
      );
      expect(replay).toEqual(first);
      const [[factCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM production_item_allocation WHERE production_batch_id=?',
        [f.batchId],
      );
      expect(Number(factCount?.count)).toBe(1);
      await expect(
        service.createAllocations(
          String(f.batchId),
          { allocations: [{ ...payload.allocations[0]!, assignedQuantity: 5 }] },
          idemCtx(actorId, `${f.token}-conflict`, key),
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

      const failedKey = `${f.token}-failed-key`;
      await expect(
        service.createAllocations(
          String(f.batchId),
          {
            allocations: [
              {
                demandId: String(f.demandId),
                itemBatchId: String(f.itemBatch1),
                assignedQuantity: 99,
              },
            ],
          },
          idemCtx(actorId, `${f.token}-failed`, failedKey),
        ),
      ).rejects.toMatchObject({ code: 'ALLOCATION_EXCEEDS_DEMAND' });
      const [[failedRecordCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM http_idempotency_records WHERE idempotency_key=?',
        [failedKey],
      );
      expect(Number(failedRecordCount?.count)).toBe(0);
      const [[failedAuditCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM operation_logs WHERE request_id=? AND result='success'",
        [`${f.token}-failed`],
      );
      expect(Number(failedAuditCount?.count)).toBe(0);
    } finally {
      await cleanup(pool, f);
    }
  });

  it('replays create and confirm without duplicate order or stock deduction and rejects damaged results', async () => {
    const f = await fixture(pool, actorId, 'outbound-idempotency');
    try {
      const allocation = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch1),
              assignedQuantity: 10,
            },
          ],
        },
        ctx(actorId, f.token),
      );
      const key = `${f.token}-outbound-key`;
      const payload = {
        details: [{ allocationId: allocation.allocations[0]!.allocationId, outboundQuantity: 10 }],
      };
      const first = await service.createOutbound(
        String(f.batchId),
        payload,
        idemCtx(actorId, `${f.token}-first`, key),
      );
      const replay = await service.createOutbound(
        String(f.batchId),
        payload,
        idemCtx(actorId, `${f.token}-replay`, key),
      );
      expect(replay).toEqual(first);
      const [[pendingLedger]] = await pool.query<(RowDataPacket & { count: number })[]>(
        "SELECT SUM(quantity) quantity,COUNT(*) count FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE outbound_id=?)",
        [first.outbound.outboundId],
      );
      expect(Number(pendingLedger?.count)).toBe(0);

      await expect(
        service.createOutbound(
          String(f.batchId),
          { details: [{ ...payload.details[0]!, outboundQuantity: 9 }] },
          idemCtx(actorId, `${f.token}-conflict`, key),
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

      await pool.execute(
        "UPDATE http_idempotency_records SET result_json=JSON_OBJECT('invalid',1) WHERE idempotency_key=?",
        [key],
      );
      await expect(
        service.createOutbound(
          String(f.batchId),
          payload,
          idemCtx(actorId, `${f.token}-corrupt`, key),
        ),
      ).rejects.toMatchObject({ kind: 'corrupt' });

      const confirmKey = `${f.token}-confirm-key`;
      const confirmed = await service.confirmOutbound(
        first.outbound.outboundId,
        first.outbound.version,
        idemCtx(actorId, `${f.token}-confirm-first`, confirmKey),
      );
      const confirmReplay = await service.confirmOutbound(
        first.outbound.outboundId,
        first.outbound.version,
        idemCtx(actorId, `${f.token}-confirm-replay`, confirmKey),
      );
      expect(confirmReplay).toEqual(confirmed);
      const [[ledger]] = await pool.query<(RowDataPacket & { quantity: string; count: number })[]>(
        "SELECT SUM(quantity) quantity,COUNT(*) count FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE outbound_id=?)",
        [first.outbound.outboundId],
      );
      expect(Number(ledger?.quantity)).toBe(-10);
      expect(Number(ledger?.count)).toBe(1);
    } finally {
      await cleanup(pool, f);
    }
  });

  it('creates pending purchase inbound without stock, confirms once, and cancels without ledger', async () => {
    const f = await fixture(pool, actorId, 'inbound');
    const inboundService = new ProductionInboundService(
      new MysqlProductionInboundRepository(pool),
      new ProductSnapshotService(new MysqlProductSnapshotRepository(pool)),
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
            { itemId: String(f.materialId), batchCode: batchCodes[0]!, inboundQuantity: 7 },
            { itemId: String(f.materialId), batchCode: batchCodes[1]!, inboundQuantity: 5 },
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
            { itemId: String(f.materialId), batchCode: batchCodes[0]!, inboundQuantity: 7 },
            { itemId: String(f.materialId), batchCode: batchCodes[1]!, inboundQuantity: 5 },
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
            { itemId: String(f.materialId), batchCode: batchCodes[2]!, inboundQuantity: 3 },
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
            { itemId: String(f.materialId), batchCode: batchCodes[3]!, inboundQuantity: 4 },
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

type Fixture = {
  token: string;
  productCategoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  productMaterialId: number;
  workOrderId: number;
  batchId: number;
  demandId: number;
  itemBatch1: number;
  itemBatch2: number;
  ownsMaterial: boolean;
  ownsItemBatches: boolean;
};
const fixture = async (
  pool: Pool,
  actorId: number,
  suffix: string,
  shared?: { sharedItemId: number; sharedCategoryId: number; sharedItemBatchId: number },
): Promise<Fixture> => {
  const token = `pm-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const pc = await ins(
    pool,
    "INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-pc`, '成品'],
  );
  const mc =
    shared?.sharedCategoryId ??
    (await ins(
      pool,
      "INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,'material')",
      [`${token}-mc`, '物料'],
    ));
  const product = await ins(
    pool,
    "INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'pcs','self_made')",
    [`${token}-p`, '产品', pc],
  );
  const material =
    shared?.sharedItemId ??
    (await ins(
      pool,
      "INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'kg','purchased')",
      [`${token}-m`, '物料', mc],
    ));
  const pm = await ins(
    pool,
    "INSERT INTO product_materials (product_id,material_product_id,quantity_per_unit,unit,is_key_material,need_batch_record) VALUES (?,?,'1.0000','kg',1,1)",
    [product, material],
  );
  const wo = await ins(
    pool,
    "INSERT INTO work_orders (work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,'10.0000','released')",
    [`${token}-wo`, product, `${token}-p`, '产品', 'pcs'],
  );
  const batch = await ins(
    pool,
    "INSERT INTO production_batches (work_order_id,product_id,batch_no,planned_quantity,status) VALUES (?,?,?,'10.0000','material_pending')",
    [wo, product, `${token}-batch`],
  );
  const demand = await ins(
    pool,
    "INSERT INTO production_item_demand (production_batch_id,product_material_id,item_id,item_code_snapshot,item_name_snapshot,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,idempotency_key,business_status,created_by,updated_by) VALUES (?,?,?,?,?,'1.0000','kg',1,1,'10.0000','10.0000',10,'normal',?,?,'active',?,?)",
    [
      batch,
      pm,
      material,
      token + '-m',
      '物料',
      `NORMAL:${batch}`,
      `NORMAL:${batch}:${pm}`,
      actorId,
      actorId,
    ],
  );
  let ib1 = shared?.sharedItemBatchId ?? 0,
    ib2 = 0;
  if (!shared) {
    ib1 = await ins(
      pool,
      "INSERT INTO item_batch (item_id,item_code_snapshot,product_name_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,'kg',?,'purchased',?,?)",
      [material, `${token}-m`, '物料', `${token}-ib1`, actorId, actorId],
    );
    ib2 = await ins(
      pool,
      "INSERT INTO item_batch (item_id,item_code_snapshot,product_name_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,'kg',?,'purchased',?,?)",
      [material, `${token}-m`, '物料', `${token}-ib2`, actorId, actorId],
    );
    await pool.execute(
      "INSERT INTO inventory_transaction (item_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,'purchase_inbound','10.0000','kg','available','manual',0,?,?),(?,?,'purchase_inbound','10.0000','kg','available','manual',0,?,?)",
      [material, ib1, `${token}-opening-1`, actorId, material, ib2, `${token}-opening-2`, actorId],
    );
  }
  return {
    token,
    productCategoryId: pc,
    materialCategoryId: mc,
    productId: product,
    materialId: material,
    productMaterialId: pm,
    workOrderId: wo,
    batchId: batch,
    demandId: demand,
    itemBatch1: ib1,
    itemBatch2: ib2,
    ownsMaterial: !shared,
    ownsItemBatches: !shared,
  };
};
const cleanup = async (pool: Pool, f: Fixture) => {
  await pool.execute('DELETE FROM operation_logs WHERE request_id=? OR request_id LIKE ?', [
    f.token,
    `${f.token}-%`,
  ]);
  await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
    `${f.token}-%`,
  ]);
  await deleteInventoryTransactions(
    pool,
    "DELETE FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE production_batch_id=?)",
    [f.batchId],
  );
  await pool.execute('DELETE FROM outbound_detail WHERE production_batch_id=?', [f.batchId]);
  await pool.execute('DELETE FROM outbound_order WHERE production_batch_id=?', [f.batchId]);
  await pool.execute(
    'DELETE FROM production_short_batch_authorization_detail WHERE authorization_id IN (SELECT id FROM production_short_batch_authorization WHERE production_batch_id=?)',
    [f.batchId],
  );
  await pool.execute(
    'DELETE FROM production_short_batch_authorization WHERE production_batch_id=?',
    [f.batchId],
  );
  await pool.execute('DELETE FROM production_item_allocation WHERE production_batch_id=?', [
    f.batchId,
  ]);
  await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [f.batchId]);
  await pool.execute('DELETE FROM production_batches WHERE id=?', [f.batchId]);
  await pool.execute('DELETE FROM work_orders WHERE id=?', [f.workOrderId]);
  await pool.execute('DELETE FROM product_materials WHERE id=?', [f.productMaterialId]);
  await pool.execute('DELETE FROM products WHERE id=?', [f.productId]);
  await pool.execute('DELETE FROM product_categories WHERE id=?', [f.productCategoryId]);
  if (f.ownsItemBatches) {
    await deleteInventoryTransactions(
      pool,
      'DELETE FROM inventory_transaction WHERE batch_id IN (?,?)',
      [f.itemBatch1, f.itemBatch2],
    );
    await pool.execute('DELETE FROM item_batch WHERE id IN (?,?)', [f.itemBatch1, f.itemBatch2]);
  }
  if (f.ownsMaterial) {
    await pool.execute('DELETE FROM products WHERE id=?', [f.materialId]);
    await pool.execute('DELETE FROM product_categories WHERE id=?', [f.materialCategoryId]);
  }
};
const deleteInventoryTransactions = async (pool: Pool, sql: string, values: unknown[]) => {
  const connection: PoolConnection = await pool.getConnection();
  try {
    await connection.query('SET @company_inventory_test_cleanup = 1');
    await connection.execute(sql, values as never);
  } finally {
    await connection.query('SET @company_inventory_test_cleanup = NULL');
    connection.release();
  }
};
const ins = async (pool: Pool, sql: string, values: unknown[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values as never);
  return Number(result.insertId);
};
const ctx = (actorId: number, requestId: string) => ({
  actorId: String(actorId),
  requestId,
  ip: null,
  userAgent: null,
});
const idemCtx = (actorId: number, requestId: string, idempotencyKey: string) => ({
  ...ctx(actorId, requestId),
  idempotencyKey,
});
const req = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
