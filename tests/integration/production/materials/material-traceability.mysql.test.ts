import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import { type Pool } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MysqlIdempotencyExecutor } from '../../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';
import { IdentityDirectoryService } from '../../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductSnapshotService } from '../../../../apps/api/src/modules/product/application/product-snapshot.service.js';
import { MysqlProductSnapshotRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import { type MysqlProductionMaterialOutboundRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material-outbound.repository.js';
import { type MysqlProductionMaterialRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material.repository.js';
import { ProductionInboundService } from '../../../../apps/api/src/modules/production/application/production-inbound.service.js';
import { MysqlInventoryInboundRepository } from '../../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-inbound.repository.js';
import { MysqlProductionSupplyDemandRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-supply-demand.repository.js';
import { MysqlMaterialVariantRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-material-variant.repository.js';
import * as materialFixtures from './material-test-fixture.js';
import { type MysqlProductionMaterialLossRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material-loss.repository.js';
import { type MysqlProductionReturnRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-return.repository.js';
import { MysqlProductionTraceRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-trace.repository.js';
import { type MysqlInventoryStockCheckRepository } from '../../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-stock-check.repository.js';
import { type MysqlProductInventoryEligibility } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-inventory-eligibility.query.js';
import * as returnLossFixtures from './return-loss-test-fixture.js';

// History and trace scenarios retain their original cross-module facts.
// The inbound history/source cases still use the removed manual purchase-inbound contract;
// this file split preserves those legacy calls and does not migrate them to procurement.
loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production material history with legacy purchase inbound MySQL transactions', () => {
  const { fixture, cleanup, deleteInventoryTransactions, ctx, idemCtx } = materialFixtures;
  let pool: Pool;
  let repository: MysqlProductionMaterialRepository;
  let outbounds: MysqlProductionMaterialOutboundRepository;
  let materialVariants: MysqlMaterialVariantRepository;
  let actorId: number;

  beforeAll(async () => {
    ({ pool, repository, outbounds, materialVariants, actorId } =
      await materialFixtures.createMaterialTestContext((createdPool) => {
        pool = createdPool;
      }));
  });

  afterAll(async () => pool?.end());

  it('reads the current material name across demand, outbound, inbound and inventory history', async () => {
    const f = await fixture(pool, actorId, 'current-name');
    const inboundBatchCode = `${f.token}-renamed-inbound`;
    let inboundId: string | null = null;
    try {
      const allocated = await repository.createAllocations(
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
        ctx(actorId, `${f.token}-allocate`),
      );
      const outbound = await outbounds.createOutbound(
        String(f.batchId),
        {
          details: [
            {
              allocationId: allocated.allocations[0]!.allocationId,
              outboundQuantity: 5,
            },
          ],
        },
        ctx(actorId, `${f.token}-outbound-create`),
      );
      const inboundService = new ProductionInboundService(
        new MysqlInventoryInboundRepository(pool, materialVariants),
        new ProductSnapshotService(new MysqlProductSnapshotRepository(pool)),
        materialVariants,
        new IdentityDirectoryService(new MysqlRbacRepository(pool)),
        new MysqlIdempotencyExecutor(pool),
      );
      const inbound = await inboundService.create(
        {
          inboundNo: `${f.token}-PI-current-name`,
          provider: '改名测试供应商',
          details: [
            {
              itemId: String(f.materialId),
              materialVariantId: String(f.materialVariant1Id),
              batchCode: inboundBatchCode,
              inboundQuantity: 7,
            },
          ],
        },
        idemCtx(actorId, `${f.token}-inbound-create`, `${f.token}-inbound-create-key`),
      );
      inboundId = inbound.inboundId;
      const confirmedInbound = await inboundService.confirm(
        inbound.inboundId,
        inbound.version,
        idemCtx(actorId, `${f.token}-inbound-confirm`, `${f.token}-inbound-confirm-key`),
      );
      const inboundBatchId = confirmedInbound.details[0]!.itemBatchId;
      const supplyDemand = new MysqlProductionSupplyDemandRepository(pool);
      const beforeSupply = await supplyDemand.list({
        keyword: `${f.token}-m`,
        page: 1,
        pageSize: 20,
      });
      const beforeSupplyRow = beforeSupply.items.find(
        (item) =>
          item.itemId === String(f.materialId) &&
          item.materialVariantId === String(f.materialVariant1Id),
      );
      if (!beforeSupplyRow) throw new Error('current-name fixture supply row missing');
      const beforeDemands = await repository.listDemands(String(f.batchId));
      const beforeBatches = await repository.listAvailableItemBatches(String(f.demandId));
      const beforeCandidates = await outbounds.listOutboundCandidates(String(f.batchId));
      const beforeOutbounds = await outbounds.listOutbounds(String(f.batchId));
      const beforeInbound = await inboundService.get(inbound.inboundId);
      const beforeInventory = await inboundService.getInventory(inboundBatchId);
      const renamedName = `当前物料名称-${f.token}`;

      await pool.execute(
        `UPDATE materials
         SET material_name=?,status=0,is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=?
         WHERE id=?`,
        [renamedName, actorId, actorId, f.materialId],
      );

      const afterSupply = await supplyDemand.list({
        keyword: renamedName,
        page: 1,
        pageSize: 20,
      });
      const afterSupplyRow = afterSupply.items.find(
        (item) =>
          item.itemId === String(f.materialId) &&
          item.materialVariantId === String(f.materialVariant1Id),
      );
      expect(afterSupplyRow).toMatchObject({
        itemId: beforeSupplyRow.itemId,
        materialVariantId: beforeSupplyRow.materialVariantId,
        itemName: renamedName,
        totalInventoryQuantity: beforeSupplyRow.totalInventoryQuantity,
        availableInventoryQuantity: beforeSupplyRow.availableInventoryQuantity,
        openDemandQuantity: beforeSupplyRow.openDemandQuantity,
        shortageQuantity: beforeSupplyRow.shortageQuantity,
      });

      const afterDemands = await repository.listDemands(String(f.batchId));
      expect(afterDemands).toHaveLength(beforeDemands.length);
      expect(afterDemands[0]).toMatchObject({
        demandId: beforeDemands[0]!.demandId,
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
        itemName: renamedName,
        demandQuantity: beforeDemands[0]!.demandQuantity,
        remainingDemandQuantity: beforeDemands[0]!.remainingDemandQuantity,
      });
      expect(afterDemands[0]!.allocations[0]).toMatchObject({
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
        assignedQuantity: beforeDemands[0]!.allocations[0]!.assignedQuantity,
      });

      const afterBatches = await repository.listAvailableItemBatches(String(f.demandId));
      expect(
        afterBatches
          .map((item) => ({
            itemBatchId: item.itemBatchId,
            itemId: item.itemId,
            materialVariantId: item.materialVariantId,
            itemName: item.itemName,
            onHandAvailableQuantity: item.onHandAvailableQuantity,
            reservedQuantity: item.reservedQuantity,
            availableToAllocateQuantity: item.availableToAllocateQuantity,
          }))
          .sort((left, right) => Number(left.itemBatchId) - Number(right.itemBatchId)),
      ).toEqual(
        beforeBatches
          .map((item) => ({
            itemBatchId: item.itemBatchId,
            itemId: item.itemId,
            materialVariantId: item.materialVariantId,
            itemName: renamedName,
            onHandAvailableQuantity: item.onHandAvailableQuantity,
            reservedQuantity: item.reservedQuantity,
            availableToAllocateQuantity: item.availableToAllocateQuantity,
          }))
          .sort((left, right) => Number(left.itemBatchId) - Number(right.itemBatchId)),
      );

      const afterCandidates = await outbounds.listOutboundCandidates(String(f.batchId));
      expect(afterCandidates).toHaveLength(beforeCandidates.length);
      expect(afterCandidates[0]).toMatchObject({
        allocationId: beforeCandidates[0]!.allocationId,
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
        itemName: renamedName,
        assignedQuantity: beforeCandidates[0]!.assignedQuantity,
      });
      const afterOutbounds = await outbounds.listOutbounds(String(f.batchId));
      expect(afterOutbounds[0]).toMatchObject({ outboundId: outbound.outbound.outboundId });
      expect(afterOutbounds[0]!.details[0]).toMatchObject({
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
        itemName: renamedName,
        outboundQuantity: beforeOutbounds[0]!.details[0]!.outboundQuantity,
      });
      expect((await outbounds.getOutbound(outbound.outbound.outboundId)).details[0]).toMatchObject({
        itemName: renamedName,
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
      });

      const afterInbound = await inboundService.get(inbound.inboundId);
      expect(afterInbound.details[0]).toMatchObject({
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
        itemName: renamedName,
        inboundQuantity: beforeInbound.details[0]!.inboundQuantity,
      });
      const listedInbounds = await inboundService.list({
        keyword: `${f.token}-PI-current-name`,
        page: 1,
        pageSize: 20,
      });
      expect(listedInbounds.items[0]?.details[0]).toMatchObject({
        itemName: renamedName,
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
      });
      const inventoryByName = await inboundService.listInventory({
        keyword: renamedName,
        page: 1,
        pageSize: 20,
      });
      expect(inventoryByName.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemBatchId: inboundBatchId,
            itemId: String(f.materialId),
            materialVariantId: String(f.materialVariant1Id),
            itemName: renamedName,
            onHandAvailableQuantity: beforeInventory.onHandAvailableQuantity,
          }),
        ]),
      );
      expect(await inboundService.getInventory(inboundBatchId)).toMatchObject({
        itemBatchId: inboundBatchId,
        itemId: String(f.materialId),
        materialVariantId: String(f.materialVariant1Id),
        itemName: renamedName,
        onHandAvailableQuantity: beforeInventory.onHandAvailableQuantity,
      });
    } finally {
      if (inboundId) {
        await deleteInventoryTransactions(
          pool,
          `DELETE FROM inventory_transaction
           WHERE reference_type='inbound_detail'
             AND reference_detail_id IN (SELECT id FROM inbound_detail WHERE inbound_id=?)`,
          [inboundId],
        );
        await pool.execute('DELETE FROM inbound_detail WHERE inbound_id=?', [inboundId]);
        await pool.execute('DELETE FROM inbound_order WHERE id=?', [inboundId]);
        await pool.execute('DELETE FROM item_batch WHERE batch_code=?', [inboundBatchCode]);
      }
      await cleanup(pool, f);
    }
  });
});

describeMysql('Production return, loss and inbound-source history MySQL transactions', () => {
  const { createFixture, cleanup, deleteInventoryTransactions, context } = returnLossFixtures;
  let pool: Pool;
  let returnRepository: MysqlProductionReturnRepository;
  let stockCheckRepository: MysqlInventoryStockCheckRepository;
  let productEligibility: MysqlProductInventoryEligibility;
  let lossRepository: MysqlProductionMaterialLossRepository;
  let actorId: number;
  let actorUsername: string;

  beforeAll(async () => {
    ({
      pool,
      returnRepository,
      stockCheckRepository,
      productEligibility,
      lossRepository,
      actorId,
      actorUsername,
    } = await returnLossFixtures.createReturnLossTestContext(
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

  it('uses the current material name for return, loss and stock-check history after soft deletion', async () => {
    const fixture = await createFixture(pool, actorId);
    try {
      const pendingReturn = await returnRepository.createReturnOrder(
        {
          productionBatchId: String(fixture.productionBatchId),
          details: [{ allocationId: String(fixture.allocationId), returnQuantity: 3 }],
        },
        context(actorId, `${fixture.token}-name-return-create`),
      );
      const confirmedReturn = await returnRepository.confirmReturnOrder(
        pendingReturn.id,
        pendingReturn.version,
        context(actorId, `${fixture.token}-name-return-confirm`),
      );
      const renamedName = `当前退料物料-${fixture.token}`;
      await pool.execute(
        `UPDATE materials
         SET material_name=?,status=0,is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=?
         WHERE id=?`,
        [renamedName, actorId, actorId, fixture.materialId],
      );

      const returnCandidates = await returnRepository.listReturnCandidates(
        String(fixture.productionBatchId),
      );
      expect(returnCandidates).toEqual([
        expect.objectContaining({
          allocationId: String(fixture.allocationId),
          itemId: String(fixture.materialId),
          materialVariantId: String(fixture.materialVariantId),
          itemName: renamedName,
          confirmedOutboundQuantity: '5.0000',
          occupiedReturnQuantity: '3.0000',
          returnableQuantity: '2.0000',
        }),
      ]);
      const returnHistory = await returnRepository.getReturnOrder(confirmedReturn.id);
      expect(returnHistory.details[0]).toMatchObject({
        itemId: String(fixture.materialId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        returnQuantity: '3.0000',
      });

      const lossCandidates = await lossRepository.listMaterialLossCandidates(
        String(fixture.productionBatchId),
      );
      expect(lossCandidates).toEqual([
        expect.objectContaining({
          allocationId: String(fixture.allocationId),
          itemId: String(fixture.materialId),
          materialVariantId: String(fixture.materialVariantId),
          itemName: renamedName,
          confirmedOutboundQuantity: '5.0000',
          occupiedReturnQuantity: '3.0000',
          availableLossQuantity: '2.0000',
        }),
      ]);
      const createdLoss = await lossRepository.createMaterialLoss(
        {
          productionBatchId: String(fixture.productionBatchId),
          allocationId: String(fixture.allocationId),
          scrapQuantity: 2,
          reasonType: '改名测试损耗',
          remark: '当前名称仍应读取主数据',
        },
        context(actorId, `${fixture.token}-name-loss-create`),
      );
      const confirmedLoss = await lossRepository.confirmMaterialLoss(
        createdLoss.id,
        createdLoss.version,
        context(actorId, `${fixture.token}-name-loss-confirm`),
      );
      expect(confirmedLoss).toMatchObject({
        id: createdLoss.id,
        itemId: String(fixture.materialId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        scrapQuantity: '2.0000',
      });
      const lossHistory = await lossRepository.listMaterialLosses({
        keyword: renamedName,
        page: 1,
        pageSize: 20,
      });
      expect(lossHistory.items).toEqual([
        expect.objectContaining({
          id: confirmedLoss.id,
          itemId: String(fixture.materialId),
          materialVariantId: String(fixture.materialVariantId),
          itemName: renamedName,
          scrapQuantity: '2.0000',
        }),
      ]);
      expect(await lossRepository.getMaterialLoss(confirmedLoss.id)).toMatchObject({
        itemName: renamedName,
        itemId: String(fixture.materialId),
        materialVariantId: String(fixture.materialVariantId),
        scrapQuantity: '2.0000',
      });

      const stockCandidates = await stockCheckRepository.listStockCheckCandidates({
        keyword: renamedName,
        stockStatus: 'available',
        page: 1,
        pageSize: 20,
      });
      expect(stockCandidates.items).toEqual([
        expect.objectContaining({
          itemBatchId: String(fixture.itemBatchId),
          itemId: String(fixture.materialId),
          materialVariantId: String(fixture.materialVariantId),
          itemName: renamedName,
          systemQuantity: '8.0000',
        }),
      ]);
      const pendingCheck = await stockCheckRepository.createStockCheck(
        {
          details: [{ itemBatchId: String(fixture.itemBatchId), stockStatus: 'available' }],
        },
        context(actorId, `${fixture.token}-name-check-create`),
      );
      expect(pendingCheck.details[0]).toMatchObject({
        itemId: String(fixture.materialId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        systemQuantity: '8.0000',
      });
      const counted = await stockCheckRepository.saveStockCheckCounts(
        pendingCheck.id,
        {
          version: pendingCheck.version,
          details: [{ detailId: pendingCheck.details[0]!.id, actualQuantity: 7 }],
        },
        context(actorId, `${fixture.token}-name-check-count`),
      );
      const completed = await stockCheckRepository.completeStockCheck(
        counted.id,
        counted.version,
        context(actorId, `${fixture.token}-name-check-complete`),
      );
      expect(completed.details[0]).toMatchObject({
        itemId: String(fixture.materialId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        systemQuantity: '8.0000',
        actualQuantity: '7.0000',
        differenceQuantity: '-1.0000',
      });
      expect((await stockCheckRepository.getStockCheck(pendingCheck.id)).details[0]).toMatchObject({
        itemName: renamedName,
        itemId: String(fixture.materialId),
        materialVariantId: String(fixture.materialVariantId),
      });
      const listedChecks = await stockCheckRepository.listStockChecks({
        keyword: pendingCheck.checkNo,
        page: 1,
        pageSize: 20,
      });
      expect(listedChecks.items[0]?.details[0]).toMatchObject({
        itemName: renamedName,
        itemId: String(fixture.materialId),
        materialVariantId: String(fixture.materialVariantId),
      });
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('classifies purchase, return and stock-check trace sources without losing current material identity', async () => {
    const fixture = await createFixture(pool, actorId);
    const inboundRepository = new MysqlInventoryInboundRepository(
      pool,
      new MysqlMaterialVariantRepository(pool, productEligibility),
    );
    const traceRepository = new MysqlProductionTraceRepository(pool);
    const inboundNo = `${fixture.token}-trace-purchase`;
    let inboundId: string | null = null;
    try {
      // Reuse the fixture batch so the linked purchase, return and adjustment
      // facts all appear in the same production trace source list.
      const pendingInbound = await inboundRepository.create(
        {
          inboundNo,
          provider: '追溯供应商',
          details: [
            {
              itemId: String(fixture.materialId),
              materialVariantId: String(fixture.materialVariantId),
              batchCode: `${fixture.token}-ib`,
              inboundQuantity: 4,
            },
          ],
        },
        [
          {
            id: String(fixture.materialId),
            materialVariantId: String(fixture.materialVariantId),
            materialVariantCode: `${fixture.token}-m-v1-A`,
            itemCode: `${fixture.token}-m`,
            productName: '原料',
            unit: 'kg',
            itemKind: 'material',
          },
        ],
        context(actorId, `${fixture.token}-trace-inbound-create`),
      );
      inboundId = pendingInbound.inboundId;
      const confirmedInbound = await inboundRepository.confirm(
        pendingInbound.inboundId,
        pendingInbound.version,
        context(actorId, `${fixture.token}-trace-inbound-confirm`),
      );
      const pendingReturn = await returnRepository.createReturnOrder(
        {
          productionBatchId: String(fixture.productionBatchId),
          details: [{ allocationId: String(fixture.allocationId), returnQuantity: 3 }],
        },
        context(actorId, `${fixture.token}-trace-return-create`),
      );
      const confirmedReturn = await returnRepository.confirmReturnOrder(
        pendingReturn.id,
        pendingReturn.version,
        context(actorId, `${fixture.token}-trace-return-confirm`),
      );
      const pendingCheck = await stockCheckRepository.createStockCheck(
        {
          details: [{ itemBatchId: String(fixture.itemBatchId), stockStatus: 'available' }],
        },
        context(actorId, `${fixture.token}-trace-check-create`),
      );
      const systemQuantity = Number(pendingCheck.details[0]!.systemQuantity);
      const counted = await stockCheckRepository.saveStockCheckCounts(
        pendingCheck.id,
        {
          version: pendingCheck.version,
          details: [
            {
              detailId: pendingCheck.details[0]!.id,
              actualQuantity: systemQuantity + 1,
            },
          ],
        },
        context(actorId, `${fixture.token}-trace-check-count`),
      );
      const completedCheck = await stockCheckRepository.completeStockCheck(
        counted.id,
        counted.version,
        context(actorId, `${fixture.token}-trace-check-complete`),
      );
      expect(completedCheck.details[0]?.differenceQuantity).toBe('1.0000');

      const renamedName = `追溯当前物料-${fixture.token}`;
      await pool.execute(
        `UPDATE materials
         SET material_name=?,status=0,is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=?
         WHERE id=?`,
        [renamedName, actorId, actorId, fixture.materialId],
      );

      const sources = await traceRepository.listMaterialInboundSources(
        String(fixture.productionBatchId),
      );
      const purchaseSource = sources.find((source) => source.sourceDocumentNo === inboundNo);
      const returnSource = sources.find(
        (source) => source.sourceDocumentNo === confirmedReturn.returnNo,
      );
      const stockCheckSource = sources.find(
        (source) => source.sourceLabel === 'stock_check_adjustment',
      );
      const unassociatedPurchase = sources.find(
        (source) => source.sourceLabel === 'purchase_inbound' && source.sourceDocumentNo === null,
      );
      expect(purchaseSource).toMatchObject({
        itemBatchId: String(fixture.itemBatchId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        sourceLabel: 'purchase_inbound',
        sourceDocumentNo: inboundNo,
        provider: '追溯供应商',
        inboundQuantity: '4.0000',
      });
      expect(purchaseSource?.confirmedAt).toBe(confirmedInbound.inboundAt);
      expect(returnSource).toMatchObject({
        itemBatchId: String(fixture.itemBatchId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        sourceLabel: 'material_return_inbound',
        sourceDocumentNo: confirmedReturn.returnNo,
        provider: null,
        inboundQuantity: '3.0000',
      });
      expect(returnSource?.confirmedAt).toBe(confirmedReturn.returnAt);
      expect(stockCheckSource).toMatchObject({
        itemBatchId: String(fixture.itemBatchId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        sourceLabel: 'stock_check_adjustment',
        sourceDocumentNo: null,
        provider: null,
        inboundQuantity: '1.0000',
      });
      expect(stockCheckSource?.confirmedAt).not.toBeNull();
      expect(unassociatedPurchase).toMatchObject({
        itemBatchId: String(fixture.itemBatchId),
        materialVariantId: String(fixture.materialVariantId),
        itemName: renamedName,
        sourceLabel: 'purchase_inbound',
        sourceDocumentNo: null,
        provider: null,
        inboundQuantity: '10.0000',
      });
      expect(unassociatedPurchase?.confirmedAt).not.toBeNull();
      for (const source of [purchaseSource, returnSource, stockCheckSource, unassociatedPurchase]) {
        expect(source).toMatchObject({
          itemBatchId: String(fixture.itemBatchId),
          materialVariantId: String(fixture.materialVariantId),
          itemName: renamedName,
        });
      }
      expect(
        await traceRepository.listInventoryTransactions(String(fixture.productionBatchId)),
      ).toEqual([
        expect.objectContaining({
          itemId: String(fixture.materialId),
          materialVariantId: String(fixture.materialVariantId),
          itemName: renamedName,
          quantity: '-5.0000',
        }),
      ]);
      const traceSearch = await traceRepository.search({
        keyword: renamedName,
        page: 1,
        pageSize: 20,
      });
      expect(traceSearch.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            batches: expect.arrayContaining([
              expect.objectContaining({
                productionBatchId: String(fixture.productionBatchId),
              }),
            ]),
          }),
        ]),
      );
    } finally {
      if (inboundId) {
        await deleteInventoryTransactions(
          pool,
          `DELETE FROM inventory_transaction
           WHERE reference_type='inbound_detail'
             AND reference_detail_id IN (SELECT id FROM inbound_detail WHERE inbound_id=?)`,
          [inboundId],
        );
        await pool.execute('DELETE FROM inbound_detail WHERE inbound_id=?', [inboundId]);
        await pool.execute('DELETE FROM inbound_order WHERE id=?', [inboundId]);
      }
      await cleanup(pool, fixture);
    }
  });
});
