import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import { type Pool, type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MysqlProductionSupplyDemandRepository } from '../../../../apps/api/src/modules/production/infrastructure/queries/mysql-production-supply-demand.repository.js';
import * as materialFixtures from './material-test-fixture.js';
import type { Fixture } from './material-test-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production material supply and demand MySQL projections', () => {
  const { fixture, cleanup, deleteInventoryTransactions, ins } = materialFixtures;
  let pool: Pool;
  let actorId: number;

  beforeAll(async () => {
    ({ pool, actorId } = await materialFixtures.createMaterialTestContext((createdPool) => {
      pool = createdPool;
    }));
  });

  afterAll(async () => pool?.end());

  it('aggregates supply and demand independently for each material variant', async () => {
    const f = await fixture(pool, actorId, 'supply-demand-variants');
    let g: Fixture | null = null;
    let h: Fixture | null = null;
    let variant3Id: number;
    let variant4Id = 0;
    let frozenItemBatchId = 0;
    const token = `${f.token}-variant-list`;
    try {
      const shared = {
        sharedItemId: f.materialId,
        sharedCategoryId: f.materialCategoryId,
        sharedItemBatchId: f.itemBatch1,
        sharedMaterialVariant1Id: f.materialVariant1Id,
        sharedMaterialVariant2Id: f.materialVariant2Id,
      };
      g = await fixture(pool, actorId, 'sd-g', shared);
      h = await fixture(pool, actorId, 'sd-h', shared);
      variant3Id = await ins(
        pool,
        "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v3','A',?,?,?)",
        [f.materialId, `${token}-v3-A`, actorId, actorId],
      );
      variant4Id = await ins(
        pool,
        "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v4','A',?,?,?)",
        [f.materialId, `${token}-v4-A`, actorId, actorId],
      );
      await pool.execute(
        'UPDATE production_item_demand SET need_number=?,remaining_number=? WHERE id=?',
        ['5.0000', '5.0000', g.demandId],
      );
      await pool.execute(
        'UPDATE production_item_demand SET material_variant_id=?,material_variant_code_snapshot=?,need_number=?,remaining_number=? WHERE id=?',
        [variant3Id, `${token}-v3-A`, '4.0000', '4.0000', h.demandId],
      );
      frozenItemBatchId = await ins(
        pool,
        "INSERT INTO item_batch (item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,?,'kg',?,'purchased',?,?)",
        [
          f.materialId,
          f.materialVariant2Id,
          `${f.token}-m`,
          `${f.token}-m-v2-A`,
          `${token}-frozen-batch`,
          actorId,
          actorId,
        ],
      );
      await pool.execute(
        "INSERT INTO inventory_transaction (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,?,'purchase_inbound','8.0000','kg','available','manual',0,?,?)",
        [f.materialId, f.materialVariant2Id, frozenItemBatchId, `${token}-frozen-inbound`, actorId],
      );
      await pool.execute("UPDATE item_batch SET batch_status='frozen' WHERE id=?", [
        frozenItemBatchId,
      ]);

      const supplyDemand = new MysqlProductionSupplyDemandRepository(pool);
      const result = await supplyDemand.list({ page: 1, pageSize: 100 });
      const trackedVariantIds = new Set([
        String(f.materialVariant1Id),
        String(f.materialVariant2Id),
        String(variant3Id),
      ]);
      const rows = result.items.filter(
        (item) =>
          item.itemId === String(f.materialId) && trackedVariantIds.has(item.materialVariantId),
      );
      expect(rows).toHaveLength(3);
      const byVariant = new Map(rows.map((item) => [item.materialVariantId, item]));
      expect(byVariant.get(String(f.materialVariant1Id))).toMatchObject({
        totalInventoryQuantity: '20',
        availableInventoryQuantity: '20',
        unavailableInventoryQuantity: '0',
        openDemandQuantity: '15',
        shortageQuantity: '0',
        isShortage: false,
      });
      expect(byVariant.get(String(f.materialVariant2Id))).toMatchObject({
        totalInventoryQuantity: '8',
        availableInventoryQuantity: '0',
        unavailableInventoryQuantity: '8',
        openDemandQuantity: '0',
        shortageQuantity: '0',
        isShortage: false,
      });
      expect(byVariant.get(String(variant3Id))).toMatchObject({
        totalInventoryQuantity: '0',
        availableInventoryQuantity: '0',
        unavailableInventoryQuantity: '0',
        openDemandQuantity: '4',
        shortageQuantity: '4',
        isShortage: true,
      });
      expect(rows.find((item) => item.materialVariantId === String(variant4Id))).toBeUndefined();
      const indexByVariant = new Map(
        result.items.map((item, index) => [item.materialVariantId, index]),
      );
      expect(indexByVariant.get(String(f.materialVariant1Id))!).toBeLessThan(
        indexByVariant.get(String(f.materialVariant2Id))!,
      );
      expect(indexByVariant.get(String(variant3Id))!).toBeLessThan(
        indexByVariant.get(String(f.materialVariant2Id))!,
      );
      const [[missingBalance]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM inventory_material_variant_balance WHERE material_id=? AND material_variant_id=?',
        [f.materialId, variant3Id],
      );
      expect(Number(missingBalance?.total ?? 0)).toBe(0);
    } finally {
      if (frozenItemBatchId) {
        await deleteInventoryTransactions(
          pool,
          'DELETE FROM inventory_transaction WHERE batch_id=?',
          [frozenItemBatchId],
        );
        await pool.execute('DELETE FROM item_batch WHERE id=?', [frozenItemBatchId]);
      }
      if (h) await cleanup(pool, h);
      if (g) await cleanup(pool, g);
      await cleanup(pool, f);
    }
  });

  it('paginates version supply demand and keeps keyword matches and demand drill-down isolated', async () => {
    const f = await fixture(pool, actorId, 'c2');
    let g: Fixture | null = null;
    let h: Fixture | null = null;
    let variant3Id: number;
    let inventoryBatch3Id = 0;
    try {
      const shared = {
        sharedItemId: f.materialId,
        sharedCategoryId: f.materialCategoryId,
        sharedItemBatchId: f.itemBatch1,
        sharedMaterialVariant1Id: f.materialVariant1Id,
        sharedMaterialVariant2Id: f.materialVariant2Id,
      };
      g = await fixture(pool, actorId, 'c2-g', shared);
      h = await fixture(pool, actorId, 'c2-h', shared);

      // Keep two active demands on v1 so keyword-filtered rows can be drilled
      // down without losing a demand belonging to another work order/batch.
      await pool.execute(
        'UPDATE production_item_demand SET need_number=?,remaining_number=? WHERE id=?',
        ['5.0000', '5.0000', h.demandId],
      );
      await pool.execute(
        'UPDATE production_item_demand SET material_variant_id=?,material_variant_code_snapshot=?,need_number=?,remaining_number=? WHERE id=?',
        [f.materialVariant2Id, `${f.token}-m-v2-A`, '7.0000', '7.0000', g.demandId],
      );

      variant3Id = await ins(
        pool,
        "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v3','A',?,?,?)",
        [f.materialId, `${f.token}-m-v3-A`, actorId, actorId],
      );
      inventoryBatch3Id = await ins(
        pool,
        "INSERT INTO item_batch (item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,?,'kg',?,'purchased',?,?)",
        [
          f.materialId,
          variant3Id,
          `${f.token}-m`,
          `${f.token}-m-v3-A`,
          `${f.token}-ib3`,
          actorId,
          actorId,
        ],
      );
      await pool.execute(
        "INSERT INTO inventory_transaction (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,?,'purchase_inbound','5.0000','kg','available','manual',0,?,?)",
        [f.materialId, variant3Id, inventoryBatch3Id, `${f.token}-opening-3`, actorId],
      );

      const supplyDemand = new MysqlProductionSupplyDemandRepository(pool);
      const keyword = f.token;
      const page1 = await supplyDemand.list({ keyword, page: 1, pageSize: 2 });
      const page2 = await supplyDemand.list({ keyword, page: 2, pageSize: 2 });
      const page3 = await supplyDemand.list({ keyword, page: 3, pageSize: 2 });
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
      expect(page3.total).toBe(3);
      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      expect(page3.items).toHaveLength(0);
      const pagedItems = [...page1.items, ...page2.items];
      expect(pagedItems.map((item) => item.materialVariantId).sort()).toEqual(
        [String(f.materialVariant1Id), String(f.materialVariant2Id), String(variant3Id)].sort(),
      );

      const v1 = pagedItems.find((item) => item.materialVariantId === String(f.materialVariant1Id));
      expect(v1).toMatchObject({
        itemId: String(f.materialId),
        totalInventoryQuantity: '20',
        availableInventoryQuantity: '20',
        openDemandQuantity: '15',
        shortageQuantity: '0',
      });

      const v1Trace = await supplyDemand.listDemandTrace(String(f.materialId), {
        materialVariantId: String(f.materialVariant1Id),
        page: 1,
        pageSize: 20,
      });
      expect(v1Trace.total).toBe(2);
      expect(v1Trace.items.map((item) => item.demandId).sort()).toEqual(
        [String(f.demandId), String(h.demandId)].sort(),
      );
      expect(
        v1Trace.items.every((item) => item.materialVariantId === String(f.materialVariant1Id)),
      ).toBe(true);
      expect(v1Trace.items.map((item) => item.productionBatchId).sort()).toEqual(
        [String(f.batchId), String(h.batchId)].sort(),
      );

      const v2Trace = await supplyDemand.listDemandTrace(String(f.materialId), {
        materialVariantId: String(f.materialVariant2Id),
        page: 1,
        pageSize: 20,
      });
      expect(v2Trace.total).toBe(1);
      expect(v2Trace.items).toEqual([
        expect.objectContaining({
          demandId: String(g.demandId),
          materialVariantId: String(f.materialVariant2Id),
          productionBatchId: String(g.batchId),
        }),
      ]);
    } finally {
      if (inventoryBatch3Id) {
        await deleteInventoryTransactions(
          pool,
          'DELETE FROM inventory_transaction WHERE batch_id=?',
          [inventoryBatch3Id],
        );
        await pool.execute('DELETE FROM item_batch WHERE id=?', [inventoryBatch3Id]);
      }
      if (h) await cleanup(pool, h);
      if (g) await cleanup(pool, g);
      await cleanup(pool, f);
    }
  });
});
