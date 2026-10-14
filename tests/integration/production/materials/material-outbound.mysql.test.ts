import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import { type Pool, type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ProductionMaterialOutboundService } from '../../../../apps/api/src/modules/production/application/production-material-outbound.service.js';
import { MysqlProductionMaterialLossRepository } from '../../../../apps/api/src/modules/production/infrastructure/logistics/mysql-production-material-loss.repository.js';
import { type MysqlProductionMaterialOutboundRepository } from '../../../../apps/api/src/modules/production/infrastructure/logistics/mysql-production-material-outbound.repository.js';
import { type MysqlProductionMaterialRepository } from '../../../../apps/api/src/modules/production/infrastructure/demand/mysql-production-material.repository.js';
import { type MysqlProductionExecutionRepository } from '../../../../apps/api/src/modules/production/infrastructure/execution/mysql-production-execution.repository.js';
import { MysqlProductionTraceRepository } from '../../../../apps/api/src/modules/production/infrastructure/queries/mysql-production-trace.repository.js';
import { MysqlProductionSupplyDemandRepository } from '../../../../apps/api/src/modules/production/infrastructure/queries/mysql-production-supply-demand.repository.js';
import * as materialFixtures from './material-test-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production material outbound and loss continuation MySQL transactions', () => {
  const { fixture, cleanup, ctx, idemCtx } = materialFixtures;
  let pool: Pool;
  let repository: MysqlProductionMaterialRepository;
  let execution: MysqlProductionExecutionRepository;
  let outbounds: MysqlProductionMaterialOutboundRepository;
  let outboundService: ProductionMaterialOutboundService;
  let actorId: number;

  beforeAll(async () => {
    ({ pool, repository, execution, outbounds, outboundService, actorId } =
      await materialFixtures.createMaterialTestContext((createdPool) => {
        pool = createdPool;
      }));
  });

  afterAll(async () => pool?.end());

  it('confirms partial outbound and handles the remaining demand after administrator start', async () => {
    const f = await fixture(pool, actorId, 'partial-outbound-start');
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
      const outbound = await outbounds.createOutbound(
        String(f.batchId),
        {
          details: [{ allocationId: allocated.allocations[0]!.allocationId, outboundQuantity: 6 }],
        },
        ctx(actorId, `${f.token}-outbound`),
      );
      const confirmed = await outbounds.confirmOutbound(
        outbound.outbound.outboundId,
        outbound.outbound.version,
        ctx(actorId, `${f.token}-confirm`),
      );
      expect(confirmed.batchStatus).toBe('material_partially_outbound');
      const [[demandAfterPartialOutbound]] = await pool.query<
        (RowDataPacket & { business_status: string; remaining_number: string | number })[]
      >('SELECT business_status,remaining_number FROM production_item_demand WHERE id=?', [
        f.demandId,
      ]);
      expect(demandAfterPartialOutbound).toMatchObject({
        business_status: 'active',
      });
      expect(Number(demandAfterPartialOutbound?.remaining_number)).toBe(4);

      const startCheck = await execution.getStartCheck(String(f.batchId));
      expect(startCheck).toMatchObject({
        canStart: true,
        hasInitialMaterialConfiguration: true,
        hasMaterialShortage: true,
        requiresReason: true,
      });
      const started = await execution.startExecution(
        String(f.batchId),
        { version: startCheck.version, reason: '有剩余需求，按计划继续执行' },
        ctx(actorId, `${f.token}-admin-start`),
      );
      expect(started).toMatchObject({
        batchStatus: 'doing',
        startReason: '有剩余需求，按计划继续执行',
      });

      const remainingAllocation = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch2),
              assignedQuantity: 4,
            },
          ],
        },
        ctx(actorId, `${f.token}-remaining-allocation`),
      );
      const remainingOutbound = await outbounds.createOutbound(
        String(f.batchId),
        {
          details: [
            {
              allocationId: remainingAllocation.allocations[0]!.allocationId,
              outboundQuantity: 4,
            },
          ],
        },
        ctx(actorId, `${f.token}-remaining-outbound`),
      );
      const completed = await outbounds.confirmOutbound(
        remainingOutbound.outbound.outboundId,
        remainingOutbound.outbound.version,
        ctx(actorId, `${f.token}-remaining-confirm`),
      );
      expect(completed.batchStatus).toBe('doing');
      expect(
        (await outbounds.listOutboundBatchOptions()).map((row) => row.productionBatchId),
      ).not.toContain(String(f.batchId));
    } finally {
      await cleanup(pool, f);
    }
  });

  it('records material loss without generating demand and continues the remaining outbound', async () => {
    const f = await fixture(pool, actorId, 'loss-and-remaining-outbound');
    const inventory = new MysqlProductionMaterialLossRepository(pool);
    try {
      const firstAllocation = await repository.createAllocations(
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
        ctx(actorId, `${f.token}-first-allocation`),
      );
      const firstOutbound = await outbounds.createOutbound(
        String(f.batchId),
        {
          details: [
            {
              allocationId: firstAllocation.allocations[0]!.allocationId,
              outboundQuantity: 6,
            },
          ],
        },
        ctx(actorId, `${f.token}-first-outbound`),
      );
      await outbounds.confirmOutbound(
        firstOutbound.outbound.outboundId,
        firstOutbound.outbound.version,
        ctx(actorId, `${f.token}-first-outbound-confirm`),
      );

      const loss = await inventory.createMaterialLoss(
        {
          productionBatchId: String(f.batchId),
          allocationId: firstAllocation.allocations[0]!.allocationId,
          scrapQuantity: 1,
          reasonType: '现场损耗',
          remark: '记录独立的现场损耗事实',
        },
        ctx(actorId, `${f.token}-loss-create`),
      );
      const confirmedLoss = await inventory.confirmMaterialLoss(
        loss.id,
        loss.version,
        ctx(actorId, `${f.token}-loss-confirm`),
      );
      expect(confirmedLoss).toMatchObject({
        status: 'confirmed',
        purpose: 'production_record',
        scrapQuantity: '1',
      });
      const [[demandCount]] = await pool.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=?',
        [f.batchId],
      );
      expect(Number(demandCount?.count)).toBe(1);

      const remainingNormalAllocation = await repository.createAllocations(
        String(f.batchId),
        {
          allocations: [
            {
              demandId: String(f.demandId),
              itemBatchId: String(f.itemBatch2),
              assignedQuantity: 4,
            },
          ],
        },
        ctx(actorId, `${f.token}-remaining-normal-allocation`),
      );
      const remainingOutbound = await outbounds.createOutbound(
        String(f.batchId),
        {
          details: [
            {
              allocationId: remainingNormalAllocation.allocations[0]!.allocationId,
              outboundQuantity: 4,
            },
          ],
        },
        ctx(actorId, `${f.token}-remaining-outbound`),
      );
      const remainingConfirmed = await outbounds.confirmOutbound(
        remainingOutbound.outbound.outboundId,
        remainingOutbound.outbound.version,
        ctx(actorId, `${f.token}-remaining-confirm`),
      );
      expect(
        (await repository.listDemands(String(f.batchId))).find(
          (demand) => demand.demandId === String(f.demandId),
        )?.businessStatus,
      ).toBe('fulfilled');
      expect(remainingConfirmed.batchStatus).toBe('material_outbound');
      expect(
        (await repository.listDemands(String(f.batchId))).map((row) => row.businessStatus),
      ).toEqual(['fulfilled']);
      expect(
        (await outbounds.listOutboundBatchOptions()).map((row) => row.productionBatchId),
      ).not.toContain(String(f.batchId));
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
      const candidates = await outbounds.listOutboundCandidates(String(f.batchId));
      expect(candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            generationGroupKey: `NORMAL:${f.batchId}`,
            generationGroupType: 'normal',
            supplementNo: null,
          }),
        ]),
      );
      const result = await outbounds.createOutbound(
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
      expect(result.outbound.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            generationGroupKey: `NORMAL:${f.batchId}`,
            generationGroupType: 'normal',
            supplementNo: null,
          }),
        ]),
      );
      expect(await outbounds.listOutboundCandidates(String(f.batchId))).toEqual([]);
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
        materialVariantId: String(f.materialVariant1Id),
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
      const confirmed = await outbounds.confirmOutbound(
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
        `SELECT current_quantity FROM inventory_material_variant_balance
         WHERE material_id=? AND material_variant_id=? AND stock_status='available' AND batch_status='available'`,
        [f.materialId, f.materialVariant1Id],
      );
      expect(Number(materialBalance?.current_quantity)).toBe(10);
      const supplyAfterConfirm = await supplyDemand.list({
        keyword: f.token + '-m',
        page: 1,
        pageSize: 20,
      });
      expect(supplyAfterConfirm.items).toMatchObject([
        expect.objectContaining({
          itemId: String(f.materialId),
          materialVariantId: String(f.materialVariant1Id),
          availableInventoryQuantity: '10',
          openDemandQuantity: '0',
          shortageQuantity: '0',
          isShortage: false,
        }),
      ]);
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
        outbounds.createOutbound(String(f.batchId), payload, ctx(actorId, `${f.token}-a`)),
        outbounds.createOutbound(String(f.batchId), payload, ctx(actorId, `${f.token}-b`)),
      ]);
      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
      const created = results.find((row) => row.status === 'fulfilled');
      if (!created || created.status !== 'fulfilled') throw new Error('pending order required');
      const beforeCancel = await outbounds.listOutboundCandidates(String(f.batchId));
      expect(beforeCancel).toHaveLength(0);
      const cancelledOutbound = await outbounds.cancelOutbound(
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
      const afterCancel = await outbounds.listOutboundCandidates(String(f.batchId));
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
        "INSERT INTO inventory_transaction (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,?,'production_material_outbound','-2.0000','kg','available','manual',0,?,?)",
        [f.materialId, f.materialVariant1Id, f.itemBatch1, `${f.token}-external-outbound`, actorId],
      );

      const pending = await outbounds.createOutbound(
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
        outbounds.confirmOutbound(pending.outbound.outboundId, 0, ctx(actorId, f.token)),
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
      const first = await outboundService.createOutbound(
        String(f.batchId),
        payload,
        idemCtx(actorId, `${f.token}-first`, key),
      );
      const replay = await outboundService.createOutbound(
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
        outboundService.createOutbound(
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
        outboundService.createOutbound(
          String(f.batchId),
          payload,
          idemCtx(actorId, `${f.token}-corrupt`, key),
        ),
      ).rejects.toMatchObject({ kind: 'corrupt' });

      const confirmKey = `${f.token}-confirm-key`;
      const confirmed = await outboundService.confirmOutbound(
        first.outbound.outboundId,
        first.outbound.version,
        idemCtx(actorId, `${f.token}-confirm-first`, confirmKey),
      );
      const confirmReplay = await outboundService.confirmOutbound(
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
});
