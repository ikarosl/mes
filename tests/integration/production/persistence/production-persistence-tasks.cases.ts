import { type RowDataPacket } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { expect, it } from 'vitest';
import { MysqlProductSnapshotRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import {
  insert,
  cleanupMassMaterialVersionChoices,
  commandContext,
  idemCtx,
  type ProductionPersistenceContext,
} from './production-persistence-fixture.js';

export const registerProductionTaskPersistenceCases = (
  getContext: () => ProductionPersistenceContext,
): void => {
  it('reuses one independent route across products while isolating snapshots and demands', async () => {
    const { pool, repository, demandService, fixture } = getContext();

    const route = await new MysqlProductSnapshotRepository(pool).getRouteSnapshot(
      String(fixture.processRouteId),
    );
    const token = `${fixture.token}-route-reuse`;
    const secondProductId = await insert(
      pool,
      'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
      [`${token}-product`, 'Route reuse product', fixture.productCategoryId, 'pcs', 'self_made'],
    );
    const secondMaterialId = await insert(
      pool,
      'INSERT INTO materials (material_code,material_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
      [`${token}-material`, 'Route reuse material', fixture.materialCategoryId, 'kg', 'purchased'],
    );
    const secondVariantId = await insert(
      pool,
      "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v1','A',?,?,?)",
      [secondMaterialId, `${token}-material-v1-A`, fixture.actorId, fixture.actorId],
    );
    const secondProductMaterialId = await insert(
      pool,
      'INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit) VALUES (?,?,?,?)',
      [secondProductId, secondMaterialId, '1.0000', 'kg'],
    );
    const workOrderIds: number[] = [];
    const batchIds: number[] = [];
    const requestIds = [`${token}-a`, `${token}-b`];
    try {
      const firstWorkOrderId = await insert(
        pool,
        'INSERT INTO work_orders (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?,?)',
        [
          `${token}-wo-a`,
          'research',
          fixture.productId,
          `${fixture.token}-product`,
          'Production test product',
          'pcs',
          '4.0000',
          'released',
        ],
      );
      const secondWorkOrderId = await insert(
        pool,
        'INSERT INTO work_orders (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?,?)',
        [
          `${token}-wo-b`,
          'research',
          secondProductId,
          `${token}-product`,
          'Route reuse product',
          'pcs',
          '4.0000',
          'released',
        ],
      );
      workOrderIds.push(firstWorkOrderId, secondWorkOrderId);

      const firstBatch = await repository.create(
        String(firstWorkOrderId),
        { batchNo: `${token}-batch-a`, plannedQuantity: 2 },
        route,
        [],
        commandContext(fixture.actorId, requestIds[0]!),
      );
      const secondBatch = await repository.create(
        String(secondWorkOrderId),
        { batchNo: `${token}-batch-b`, plannedQuantity: 2 },
        route,
        [],
        commandContext(fixture.actorId, requestIds[1]!),
      );
      batchIds.push(Number(firstBatch.id), Number(secondBatch.id));

      await demandService.configure(
        String(firstBatch.id),
        {
          requirements: [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant1Id), quantity: 2 }],
            },
          ],
        },
        idemCtx(fixture.actorId, `${token}-configure-a`, `${token}-configure-a`),
      );
      await demandService.configure(
        String(secondBatch.id),
        {
          requirements: [
            {
              productMaterialId: String(secondProductMaterialId),
              splits: [{ materialVariantId: String(secondVariantId), quantity: 2 }],
            },
          ],
        },
        idemCtx(fixture.actorId, `${token}-configure-b`, `${token}-configure-b`),
      );

      const [[routeColumn]] = await pool.query<(RowDataPacket & { total: number })[]>(
        `SELECT COUNT(*) total FROM information_schema.columns
         WHERE table_schema=DATABASE() AND table_name='process_routes' AND column_name='product_id'`,
      );
      expect(Number(routeColumn?.total ?? 0)).toBe(0);
      const [batches] = await pool.query<
        (RowDataPacket & {
          id: number;
          work_order_id: number;
          product_id: number;
          route_id: number;
          route_code_snapshot: string;
          route_version_snapshot: string;
          step_code_snapshot: string;
        })[]
      >(
        `SELECT b.id,b.work_order_id,b.product_id,b.route_id,b.route_code_snapshot,
                b.route_version_snapshot,s.step_code_snapshot
           FROM production_batches b
           JOIN batch_step_records s ON s.production_batch_id=b.id AND s.step_order_snapshot=1
          WHERE b.id IN (?,?) ORDER BY b.id`,
        batchIds,
      );
      expect(batches).toHaveLength(2);
      expect(new Set(batches.map((batch) => batch.route_id)).size).toBe(1);
      expect(new Set(batches.map((batch) => batch.route_code_snapshot)).size).toBe(1);
      expect(new Set(batches.map((batch) => batch.route_version_snapshot)).size).toBe(1);
      expect(new Set(batches.map((batch) => batch.step_code_snapshot)).size).toBe(1);
      expect(new Set(batches.map((batch) => batch.product_id)).size).toBe(2);
      expect(new Set(batches.map((batch) => batch.work_order_id)).size).toBe(2);
      expect(batches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            route_id: Number(route.id),
            route_code_snapshot: route.routeCode,
            route_version_snapshot: route.versionNo,
            step_code_snapshot: route.steps[0]?.stepCode,
          }),
        ]),
      );

      const [demands] = await pool.query<
        (RowDataPacket & {
          production_batch_id: number;
          item_id: number;
          material_variant_id: number;
          need_number: string;
        })[]
      >(
        `SELECT production_batch_id,item_id,material_variant_id,need_number
           FROM production_item_demand WHERE production_batch_id IN (?,?) ORDER BY production_batch_id`,
        batchIds,
      );
      expect(demands).toEqual([
        expect.objectContaining({
          production_batch_id: Number(firstBatch.id),
          item_id: fixture.materialId,
          material_variant_id: fixture.materialVariant1Id,
          need_number: '2.0000',
        }),
        expect.objectContaining({
          production_batch_id: Number(secondBatch.id),
          item_id: secondMaterialId,
          material_variant_id: secondVariantId,
          need_number: '2.0000',
        }),
      ]);
    } finally {
      if (batchIds.length > 0) {
        await pool.execute(
          `DELETE FROM production_item_demand WHERE production_batch_id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
        await pool.execute(
          `DELETE FROM production_material_requirement_basis WHERE production_batch_id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
        await pool.execute(
          `DELETE FROM batch_step_records WHERE production_batch_id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
        await pool.execute(
          `DELETE FROM production_batches WHERE id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
      }
      if (workOrderIds.length > 0) {
        await pool.execute(
          `DELETE FROM work_orders WHERE id IN (${workOrderIds.map(() => '?').join(',')})`,
          workOrderIds,
        );
      }
      await pool.execute('DELETE FROM product_materials WHERE id=?', [secondProductMaterialId]);
      await pool.execute('DELETE FROM material_variants WHERE id=?', [secondVariantId]);
      await pool.execute('DELETE FROM products WHERE id=?', [secondProductId]);
      await pool.execute('DELETE FROM materials WHERE id=?', [secondMaterialId]);
      await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
        `${token}%`,
      ]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${token}%`]);
    }
  });

  it('keeps manual additions attached to their batch, basis, and selected variant', async () => {
    const { pool, repository, demandService, fixture } = getContext();

    const token = `${fixture.token}-addition-isolation`;
    const batch = await repository.create(
      String(fixture.workOrderId),
      { batchNo: `${token}-batch`, plannedQuantity: 1 },
      null,
      [],
      commandContext(fixture.actorId, `${token}-batch-create`),
    );
    const additionIds: string[] = [];
    try {
      await demandService.configure(
        String(batch.id),
        {
          requirements: [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant1Id), quantity: 1 }],
            },
          ],
        },
        idemCtx(fixture.actorId, `${token}-configure`, `${token}-configure`),
      );
      const firstAddition = await demandService.addManual(
        String(fixture.batchId),
        {
          requirements: [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant2Id), quantity: 1 }],
            },
          ],
          reason: 'cross-batch addition one',
        },
        idemCtx(fixture.actorId, `${token}-addition-one`, `${token}-addition-one`),
      );
      const secondAddition = await demandService.addManual(
        String(batch.id),
        {
          requirements: [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant1Id), quantity: 1 }],
            },
          ],
          reason: 'cross-batch addition two',
        },
        idemCtx(fixture.actorId, `${token}-addition-two`, `${token}-addition-two`),
      );
      additionIds.push(firstAddition.additionId, secondAddition.additionId);

      const [rows] = await pool.query<
        (RowDataPacket & {
          addition_batch_id: number;
          demand_batch_id: number;
          requirement_basis_id: number;
          basis_batch_id: number;
          material_variant_id: number;
          need_number: string;
        })[]
      >(
        `SELECT addition.production_batch_id addition_batch_id,
                demand.production_batch_id demand_batch_id,
                demand.requirement_basis_id,basis.production_batch_id basis_batch_id,
                demand.material_variant_id,demand.need_number
           FROM production_manual_demand_addition addition
           JOIN production_item_demand demand ON demand.manual_addition_id=addition.id
           JOIN production_material_requirement_basis basis ON basis.id=demand.requirement_basis_id
          WHERE addition.id IN (?,?) ORDER BY addition.production_batch_id`,
        additionIds,
      );
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            addition_batch_id: fixture.batchId,
            demand_batch_id: fixture.batchId,
            basis_batch_id: fixture.batchId,
            material_variant_id: fixture.materialVariant2Id,
            need_number: '1.0000',
          }),
          expect.objectContaining({
            addition_batch_id: Number(batch.id),
            demand_batch_id: Number(batch.id),
            basis_batch_id: Number(batch.id),
            material_variant_id: fixture.materialVariant1Id,
            need_number: '1.0000',
          }),
        ]),
      );
    } finally {
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        batch.id,
      ]);
      await pool.execute(
        'DELETE FROM production_item_demand WHERE manual_addition_id IS NOT NULL AND production_batch_id=?',
        [fixture.batchId],
      );
      if (additionIds.length > 0) {
        await pool.execute(
          `DELETE FROM production_manual_demand_addition WHERE id IN (${additionIds.map(() => '?').join(',')})`,
          additionIds,
        );
      }
      await pool.execute(
        'DELETE FROM production_material_requirement_basis WHERE production_batch_id=?',
        [batch.id],
      );
      await pool.execute('DELETE FROM production_batches WHERE id=?', [batch.id]);
      await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
        `${token}%`,
      ]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${token}%`]);
      await pool.execute(
        'DELETE FROM production_manual_demand_addition WHERE production_batch_id=?',
        [fixture.batchId],
      );
    }
  });

  it('allows research splits but keeps mass-production versions locked across batches', async () => {
    const { pool, repository, demandService, fixture } = getContext();

    const token = `${fixture.token}-mass-version-policy`;
    const workOrderId = await insert(
      pool,
      'INSERT INTO work_orders (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?,?)',
      [
        `${token}-wo`,
        'mass_production',
        fixture.productId,
        `${fixture.token}-product`,
        'Production test product',
        'pcs',
        '4.0000',
        'released',
      ],
    );
    const batchIds: number[] = [];
    try {
      const firstBatch = await repository.create(
        String(workOrderId),
        { batchNo: `${token}-batch-one`, plannedQuantity: 2 },
        null,
        [],
        commandContext(fixture.actorId, `${token}-batch-one-create`),
      );
      batchIds.push(Number(firstBatch.id));
      await expect(
        demandService.configure(
          String(firstBatch.id),
          {
            requirements: [
              {
                productMaterialId: String(fixture.productMaterialId),
                splits: [
                  { materialVariantId: String(fixture.materialVariant1Id), quantity: 1 },
                  { materialVariantId: String(fixture.materialVariant2Id), quantity: 1 },
                ],
              },
            ],
          },
          idemCtx(fixture.actorId, `${token}-split-rejected`, `${token}-split-rejected`),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      const [[rejectedCounts]] = await pool.query<
        (RowDataPacket & { basis_count: number; demand_count: number; lock_count: number })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM production_material_requirement_basis WHERE production_batch_id=?) basis_count,
           (SELECT COUNT(*) FROM production_item_demand WHERE production_batch_id=?) demand_count,
           (SELECT COUNT(*) FROM work_order_material_versions WHERE work_order_id=? AND material_id=?) lock_count`,
        [firstBatch.id, firstBatch.id, workOrderId, fixture.materialId],
      );
      expect(rejectedCounts).toEqual({ basis_count: 0, demand_count: 0, lock_count: 0 });

      await demandService.configure(
        String(firstBatch.id),
        {
          requirements: [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant1Id), quantity: 2 }],
            },
          ],
        },
        idemCtx(fixture.actorId, `${token}-first-v1`, `${token}-first-v1`),
      );
      const [[locked]] = await pool.query<(RowDataPacket & { material_variant_id: number })[]>(
        'SELECT material_variant_id FROM work_order_material_versions WHERE work_order_id=? AND material_id=?',
        [workOrderId, fixture.materialId],
      );
      expect(locked?.material_variant_id).toBe(fixture.materialVariant1Id);

      const secondBatch = await repository.create(
        String(workOrderId),
        { batchNo: `${token}-batch-two`, plannedQuantity: 1 },
        null,
        [],
        commandContext(fixture.actorId, `${token}-batch-two-create`),
      );
      batchIds.push(Number(secondBatch.id));
      await expect(
        demandService.configure(
          String(secondBatch.id),
          {
            requirements: [
              {
                productMaterialId: String(fixture.productMaterialId),
                splits: [{ materialVariantId: String(fixture.materialVariant2Id), quantity: 1 }],
              },
            ],
          },
          idemCtx(fixture.actorId, `${token}-second-v2`, `${token}-second-v2`),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await demandService.configure(
        String(secondBatch.id),
        {
          requirements: [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant1Id), quantity: 1 }],
            },
          ],
        },
        idemCtx(fixture.actorId, `${token}-second-v1`, `${token}-second-v1`),
      );
      await expect(
        demandService.addManual(
          String(firstBatch.id),
          {
            requirements: [
              {
                productMaterialId: String(fixture.productMaterialId),
                splits: [{ materialVariantId: String(fixture.materialVariant2Id), quantity: 1 }],
              },
            ],
            reason: 'mass-production locked version rejection',
          },
          idemCtx(fixture.actorId, `${token}-manual-v2`, `${token}-manual-v2`),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      const [[manualCount]] = await pool.query<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) total FROM production_manual_demand_addition WHERE production_batch_id=?',
        [firstBatch.id],
      );
      expect(Number(manualCount?.total ?? 0)).toBe(0);
    } finally {
      if (batchIds.length > 0) {
        await pool.execute(
          `DELETE FROM production_item_demand WHERE production_batch_id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
        await pool.execute(
          `DELETE FROM production_manual_demand_addition WHERE production_batch_id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
        await pool.execute(
          `DELETE FROM production_material_requirement_basis WHERE production_batch_id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
        await pool.execute(
          `DELETE FROM production_batches WHERE id IN (${batchIds.map(() => '?').join(',')})`,
          batchIds,
        );
      }
      await cleanupMassMaterialVersionChoices(pool, workOrderId);
      await pool.execute('DELETE FROM work_orders WHERE id=?', [workOrderId]);
      await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
        `${token}%`,
      ]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${token}%`]);
    }
  });
};
