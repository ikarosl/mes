import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type ExecuteValues,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CommandContext } from '../../../apps/api/src/common/audit/audit.types.js';
import { MysqlProductionBatchRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionMaterialDemandConfigurationRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-material-demand-configuration.repository.js';
import { ProductionMaterialDemandService } from '../../../apps/api/src/modules/production/application/production-material-demand.service.js';
import { MysqlProductSnapshotRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import { ProductSnapshotService } from '../../../apps/api/src/modules/product/application/product-snapshot.service.js';
import { MysqlMaterialVariantRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-material-variant.repository.js';
import { MysqlIdempotencyExecutor } from '../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production MySQL persistence', () => {
  let pool: Pool;
  let repository: MysqlProductionBatchRepository;
  let demandRepository: MysqlProductionMaterialDemandConfigurationRepository;
  let demandService: ProductionMaterialDemandService;
  let variants: MysqlMaterialVariantRepository;
  let fixture: Fixture;

  beforeAll(async () => {
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database: requiredEnv('DB_NAME'),
      charset: 'utf8mb4_0900_ai_ci',
      timezone: '+08:00',
      connectionLimit: 4,
    });
    repository = new MysqlProductionBatchRepository(pool);
    variants = new MysqlMaterialVariantRepository(pool);
    demandRepository = new MysqlProductionMaterialDemandConfigurationRepository(
      pool,
      new ProductSnapshotService(new MysqlProductSnapshotRepository(pool)),
      variants,
    );
    demandService = new ProductionMaterialDemandService(
      demandRepository,
      new MysqlIdempotencyExecutor(pool),
    );
    fixture = await createFixture(pool);
  });

  afterAll(async () => {
    if (pool && fixture) {
      await pool.execute('DELETE FROM operation_logs WHERE request_id=?', [fixture.requestId]);
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        fixture.batchId,
      ]);
      await pool.execute(
        'DELETE FROM production_material_requirement_basis WHERE production_batch_id=?',
        [fixture.batchId],
      );
      await pool.execute(
        'DELETE FROM batch_step_abnormal_dispositions WHERE production_batch_id=?',
        [fixture.batchId],
      );
      await pool.execute(
        'DELETE FROM batch_step_reports WHERE production_batch_id=? AND (reversal_of_report_id IS NOT NULL OR replaces_report_id IS NOT NULL)',
        [fixture.batchId],
      );
      await pool.execute(
        'DELETE FROM batch_step_reports WHERE production_batch_id=? AND reversal_of_report_id IS NULL AND replaces_report_id IS NULL',
        [fixture.batchId],
      );
      await pool.execute('DELETE FROM batch_step_records WHERE production_batch_id=?', [
        fixture.batchId,
      ]);
      await pool.execute('DELETE FROM production_batches WHERE work_order_id=?', [
        fixture.workOrderId,
      ]);
      await pool.execute('DELETE FROM work_order_material_versions WHERE work_order_id=?', [
        fixture.workOrderId,
      ]);
      await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
      await pool.execute('DELETE FROM process_route_steps WHERE route_id=?', [
        fixture.processRouteId,
      ]);
      await pool.execute('DELETE FROM process_routes WHERE id=?', [fixture.processRouteId]);
      await pool.execute('DELETE FROM process_steps WHERE id=?', [fixture.processStepId]);
      await pool.execute('DELETE FROM product_materials WHERE product_id=?', [fixture.productId]);
      await pool.execute('DELETE FROM material_variants WHERE material_id=?', [fixture.materialId]);
      await pool.execute('DELETE FROM products WHERE id=?', [fixture.productId]);
      await pool.execute('DELETE FROM materials WHERE id=?', [fixture.materialId]);
      await pool.execute('DELETE FROM product_categories WHERE id IN (?,?)', [
        fixture.productCategoryId,
        fixture.materialCategoryId,
      ]);
    }
    await pool?.end();
  });

  it('persists administrator-selected exact versions, supports a split and replays the same intent', async () => {
    const payload = {
      requirements: [
        {
          productMaterialId: String(fixture.productMaterialId),
          splits: [
            { materialVariantId: String(fixture.materialVariant1Id), quantity: 2 },
            { materialVariantId: String(fixture.materialVariant2Id), quantity: 1 },
          ],
        },
      ],
    };
    const first = await demandService.configure(
      String(fixture.batchId),
      payload,
      idemCtx(fixture.actorId, `${fixture.token}-configure`, `${fixture.token}-configure-key`),
    );
    const replay = await demandService.configure(
      String(fixture.batchId),
      payload,
      idemCtx(
        fixture.actorId,
        `${fixture.token}-configure-replay`,
        `${fixture.token}-configure-key`,
      ),
    );
    expect(first).toEqual({ configured: true });
    expect(replay).toEqual(first);

    const [demands] = await pool.query<
      (RowDataPacket & {
        requirement_basis_id: number;
        material_variant_id: number;
        material_variant_code_snapshot: string;
        need_number: string;
        demand_type: string;
      })[]
    >(
      `SELECT requirement_basis_id,material_variant_id,material_variant_code_snapshot,need_number,demand_type
       FROM production_item_demand WHERE production_batch_id=? ORDER BY material_variant_id`,
      [fixture.batchId],
    );
    expect(demands).toHaveLength(2);
    const demandByVariant = new Map(demands.map((row) => [row.material_variant_id, row]));
    expect(Number(demandByVariant.get(fixture.materialVariant1Id)?.need_number)).toBe(2);
    expect(Number(demandByVariant.get(fixture.materialVariant2Id)?.need_number)).toBe(1);
    expect(demands.every((row) => row.requirement_basis_id > 0)).toBe(true);
    expect(demands.every((row) => row.demand_type === 'normal')).toBe(true);
    expect(demandByVariant.get(fixture.materialVariant1Id)?.material_variant_code_snapshot).toBe(
      `${fixture.token}-material-v1-A`,
    );
    expect(demandByVariant.get(fixture.materialVariant2Id)?.material_variant_code_snapshot).toBe(
      `${fixture.token}-material-v2-A`,
    );
    const [[basis]] = await pool.query<
      (RowDataPacket & { required_number: string; material_id: number })[]
    >(
      'SELECT required_number,material_id FROM production_material_requirement_basis WHERE production_batch_id=?',
      [fixture.batchId],
    );
    expect(basis).toMatchObject({
      required_number: '3.0000',
      material_id: fixture.materialId,
    });
    const [[researchLock]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM work_order_material_versions WHERE work_order_id=? AND material_id=?',
      [fixture.workOrderId, fixture.materialId],
    );
    expect(Number(researchLock?.total ?? 0)).toBe(0);
    const [[batch]] = await pool.query<(RowDataPacket & { status: string; version: number })[]>(
      'SELECT status,version FROM production_batches WHERE id=?',
      [fixture.batchId],
    );
    expect(batch).toEqual({ status: 'material_pending', version: 1 });
    await expect(
      demandService.configure(
        String(fixture.batchId),
        payload,
        idemCtx(
          fixture.actorId,
          `${fixture.token}-configure-conflict`,
          `${fixture.token}-other-key`,
        ),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('serializes concurrent first version selection to one demand plan', async () => {
    const batch = await repository.create(
      String(fixture.workOrderId),
      { batchNo: `${fixture.token}-version-race`, plannedQuantity: 1 },
      null,
      [],
      {
        actorId: String(fixture.actorId),
        ip: null,
        requestId: `${fixture.requestId}-version-race-create`,
        userAgent: null,
      },
    );
    const attempts = [
      {
        materialVariantId: String(fixture.materialVariant1Id),
        requestId: `${fixture.requestId}-version-race-v1`,
        idempotencyKey: `${fixture.token}-version-race-v1`,
      },
      {
        materialVariantId: String(fixture.materialVariant2Id),
        requestId: `${fixture.requestId}-version-race-v2`,
        idempotencyKey: `${fixture.token}-version-race-v2`,
      },
    ];
    const payloadFor = (materialVariantId: string) => ({
      requirements: [
        {
          productMaterialId: String(fixture.productMaterialId),
          splits: [{ materialVariantId, quantity: 1 }],
        },
      ],
    });

    try {
      const results = await Promise.allSettled(
        attempts.map((attempt) =>
          demandService.configure(
            String(batch.id),
            payloadFor(attempt.materialVariantId),
            idemCtx(fixture.actorId, attempt.requestId, attempt.idempotencyKey),
          ),
        ),
      );
      const winners = results.filter((result) => result.status === 'fulfilled');
      const losers = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]?.reason).toMatchObject({ code: 'INVALID_STATE' });

      const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
      const winner = attempts[winnerIndex];
      expect(winner).toBeDefined();
      const [demands] = await pool.query<
        (RowDataPacket & { material_variant_id: number; need_number: string })[]
      >(
        'SELECT material_variant_id,need_number FROM production_item_demand WHERE production_batch_id=?',
        [batch.id],
      );
      expect(demands).toHaveLength(1);
      expect(demands[0]).toMatchObject({
        material_variant_id: Number(winner!.materialVariantId),
        need_number: '1.0000',
      });
      const [[counts]] = await pool.query<
        (RowDataPacket & { basis_count: number; demand_count: number })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM production_material_requirement_basis WHERE production_batch_id=?) basis_count,
           (SELECT COUNT(*) FROM production_item_demand WHERE production_batch_id=?) demand_count`,
        [batch.id, batch.id],
      );
      expect(counts).toEqual({ basis_count: 1, demand_count: 1 });
    } finally {
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        batch.id,
      ]);
      await pool.execute(
        'DELETE FROM production_material_requirement_basis WHERE production_batch_id=?',
        [batch.id],
      );
      await pool.execute('DELETE FROM production_batches WHERE id=?', [batch.id]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [
        `${fixture.requestId}-version-race%`,
      ]);
    }
  });

  it('reuses one independent route across products while isolating snapshots and demands', async () => {
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
      'INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit,is_key_material,need_batch_record) VALUES (?,?,?,?,?,?)',
      [secondProductId, secondMaterialId, '1.0000', 'kg', 1, 0],
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

  it('rolls back failed demand configuration and batch creation transactions', async () => {
    const token = `${fixture.token}-rollback`;
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
    const configBatch = await repository.create(
      String(workOrderId),
      { batchNo: `${token}-config-batch`, plannedQuantity: 1 },
      null,
      [],
      commandContext(fixture.actorId, `${token}-config-batch-create`),
    );
    try {
      const oversizedRequestId = `${token}-${'x'.repeat(128)}`;
      await expect(
        demandRepository.configureNormalDemands(
          String(configBatch.id),
          [
            {
              productMaterialId: String(fixture.productMaterialId),
              splits: [{ materialVariantId: String(fixture.materialVariant1Id), quantity: 1 }],
            },
          ],
          {
            actorId: String(fixture.actorId),
            requestId: oversizedRequestId,
            ip: null,
            userAgent: null,
          },
        ),
      ).rejects.toBeDefined();
      const [[demandRollback]] = await pool.query<
        (RowDataPacket & {
          basis_count: number;
          demand_count: number;
          lock_count: number;
          audit_count: number;
          batch_status: string;
          batch_version: number;
        })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM production_material_requirement_basis WHERE production_batch_id=?) basis_count,
           (SELECT COUNT(*) FROM production_item_demand WHERE production_batch_id=?) demand_count,
           (SELECT COUNT(*) FROM work_order_material_versions WHERE work_order_id=? AND material_id=?) lock_count,
           (SELECT COUNT(*) FROM operation_logs WHERE request_id=? AND action='production-material-demand.configure-normal' AND result='success') audit_count,
           b.status batch_status,b.version batch_version
         FROM production_batches b WHERE b.id=?`,
        [
          configBatch.id,
          configBatch.id,
          workOrderId,
          fixture.materialId,
          oversizedRequestId,
          configBatch.id,
        ],
      );
      expect(demandRollback).toMatchObject({
        basis_count: 0,
        demand_count: 0,
        lock_count: 0,
        audit_count: 0,
        batch_status: 'pending',
        batch_version: 0,
      });

      const route = await new MysqlProductSnapshotRepository(pool).getRouteSnapshot(
        String(fixture.processRouteId),
      );
      const firstStep = route.steps[0];
      expect(firstStep).toBeDefined();
      const brokenRoute = { ...route, steps: [firstStep!, firstStep!] };
      const createFailureRequestId = `${token}-create-failure`;
      await expect(
        repository.create(
          String(workOrderId),
          { batchNo: `${token}-create-failure`, plannedQuantity: 1 },
          brokenRoute,
          [],
          commandContext(fixture.actorId, createFailureRequestId),
        ),
      ).rejects.toBeDefined();
      const [[createRollback]] = await pool.query<
        (RowDataPacket & { batch_count: number; audit_count: number })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM production_batches WHERE batch_no=?) batch_count,
           (SELECT COUNT(*) FROM operation_logs WHERE request_id=? AND action='production-batch.create' AND result='success') audit_count`,
        [`${token}-create-failure`, createFailureRequestId],
      );
      expect(createRollback).toEqual({ batch_count: 0, audit_count: 0 });
    } finally {
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        configBatch.id,
      ]);
      await pool.execute(
        'DELETE FROM production_manual_demand_addition WHERE production_batch_id=?',
        [configBatch.id],
      );
      await pool.execute(
        'DELETE FROM production_material_requirement_basis WHERE production_batch_id=?',
        [configBatch.id],
      );
      await pool.execute('DELETE FROM production_batches WHERE id=?', [configBatch.id]);
      await cleanupMassMaterialVersionChoices(pool, workOrderId);
      await pool.execute('DELETE FROM work_orders WHERE id=?', [workOrderId]);
      await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
        `${token}%`,
      ]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${token}%`]);
    }
  });

  it('serializes concurrent batch creation by locking the work order and duplicate batch number', async () => {
    const payload = { batchNo: fixture.concurrentBatchNo, plannedQuantity: 1 };
    const commandContext: CommandContext = {
      actorId: String(fixture.actorId),
      ip: null,
      requestId: fixture.requestId,
      userAgent: null,
    };
    const results = await Promise.allSettled([
      repository.create(String(fixture.workOrderId), payload, null, [], commandContext),
      repository.create(String(fixture.workOrderId), payload, null, [], commandContext),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejection?.reason).toMatchObject({ code: 'CONFLICT' });
    const [[count]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM production_batches WHERE work_order_id=? AND batch_no=?',
      [fixture.workOrderId, fixture.concurrentBatchNo],
    );
    expect(Number(count.total)).toBe(1);
  });

  it('stores immutable report facts and derives the compatibility totals after reversal and correction', async () => {
    const token = `report-${Date.now()}-${process.pid}`;
    const originalId = await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?)`,
      [
        `${token}-original`,
        fixture.batchId,
        fixture.batchStepRecordId,
        '4.0000',
        '4.0000',
        '0.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?)`,
      [
        `${token}-first`,
        fixture.batchId,
        fixture.batchStepRecordId,
        '6.0000',
        '5.0000',
        '1.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reversal_of_report_id,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'reversal',?,?,?,?,?,?)`,
      [
        `${token}-reversal`,
        fixture.batchId,
        fixture.batchStepRecordId,
        originalId,
        '4.0000',
        '4.0000',
        '0.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,replaces_report_id,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?,?)`,
      [
        `${token}-replacement`,
        fixture.batchId,
        fixture.batchStepRecordId,
        originalId,
        '3.0000',
        '2.0000',
        '1.0000',
        'pcs',
        fixture.actorId,
      ],
    );

    await expect(
      pool.execute(
        `INSERT INTO batch_step_reports
          (report_no,production_batch_id,batch_step_record_id,report_type,reversal_of_report_id,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
         VALUES (?,?,?,'reversal',?,?,?,?,?,?)`,
        [
          `${token}-duplicate-reversal`,
          fixture.batchId,
          fixture.batchStepRecordId,
          originalId,
          '4.0000',
          '4.0000',
          '0.0000',
          'pcs',
          fixture.actorId,
        ],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    const detail = await repository.get(String(fixture.batchId));
    expect(detail.stepRecords).toHaveLength(1);
    expect(detail.stepRecords[0]).toMatchObject({
      outputQuantity: '9.0000',
      qualifiedQuantity: '7.0000',
      abnormalQuantity: '2.0000',
      reworkQuantity: '0.0000',
    });

    const [legacyColumns] = await pool.query<RowDataPacket[]>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema=DATABASE() AND table_name='batch_step_records'
         AND column_name IN ('output_quantity','qualified_quantity','abnormal_quantity','rework_quantity')`,
    );
    expect(legacyColumns).toHaveLength(0);
  });

  it('enforces abnormal disposition identity, review state and separated step status', async () => {
    const token = `disposition-${Date.now()}-${process.pid}`;
    const reportId = await insert(
      pool,
      `INSERT INTO batch_step_reports
        (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,created_by)
       VALUES (?,?,?,'normal',?,?,?,?,?)`,
      [
        `${token}-report`,
        fixture.batchId,
        fixture.batchStepRecordId,
        '2.0000',
        '1.0000',
        '1.0000',
        'pcs',
        fixture.actorId,
      ],
    );
    const dispositionId = await insert(
      pool,
      `INSERT INTO batch_step_abnormal_dispositions
        (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,created_by,updated_by)
       VALUES (?,?,?,?,?,?)`,
      [
        `${token}-disposition`,
        fixture.batchId,
        fixture.batchStepRecordId,
        reportId,
        fixture.actorId,
        fixture.actorId,
      ],
    );

    await expect(
      pool.execute(
        `INSERT INTO batch_step_abnormal_dispositions
          (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,created_by,updated_by)
         VALUES (?,?,?,?,?,?)`,
        [
          `${token}-duplicate`,
          fixture.batchId,
          fixture.batchStepRecordId,
          reportId,
          fixture.actorId,
          fixture.actorId,
        ],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await expect(
      pool.execute(
        "UPDATE batch_step_abnormal_dispositions SET review_status='approved' WHERE id=?",
        [dispositionId],
      ),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

    await pool.execute(
      `UPDATE batch_step_abnormal_dispositions
       SET review_status='approved',disposition_type='scrap',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,
           version=version+1,updated_by=?
       WHERE id=? AND version=0`,
      [fixture.actorId, fixture.actorId, dispositionId],
    );
    const [[disposition]] = await pool.query<DispositionRow[]>(
      `SELECT review_status,disposition_type,reviewed_by,version
       FROM batch_step_abnormal_dispositions WHERE id=?`,
      [dispositionId],
    );
    expect(disposition).toMatchObject({
      review_status: 'approved',
      disposition_type: 'scrap',
      reviewed_by: fixture.actorId,
      version: 1,
    });

    await expect(
      pool.execute("UPDATE batch_step_records SET status='abnormal' WHERE id=?", [
        fixture.batchStepRecordId,
      ]),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });
});

interface Fixture {
  token: string;
  requestId: string;
  productCategoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  materialVariant1Id: number;
  materialVariant2Id: number;
  productMaterialId: number;
  processStepId: number;
  processRouteId: number;
  workOrderId: number;
  batchId: number;
  batchStepRecordId: number;
  actorId: number;
  concurrentBatchNo: string;
}

type DispositionRow = RowDataPacket & {
  review_status: string;
  disposition_type: string | null;
  reviewed_by: number | null;
  version: number;
};

const createFixture = async (pool: Pool): Promise<Fixture> => {
  const token = `production-test-${Date.now()}-${process.pid}`;
  const productCategoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
    [`${token}-finished`, 'Production test finished', 'finished_product'],
  );
  const materialCategoryId = await insert(
    pool,
    'INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
    [`${token}-material`, 'Production test material', 'material'],
  );
  const productId = await insert(
    pool,
    'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
    [`${token}-product`, 'Production test product', productCategoryId, 'pcs', 'self_made'],
  );
  const materialId = await insert(
    pool,
    'INSERT INTO materials (material_code,material_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
    [`${token}-material`, 'Production test material', materialCategoryId, 'kg', 'purchased'],
  );
  const materialVariant1Id = await insert(
    pool,
    "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v1','A',?,?,?)",
    [materialId, `${token}-material-v1-A`, 1, 1],
  );
  const materialVariant2Id = await insert(
    pool,
    "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v2','A',?,?,?)",
    [materialId, `${token}-material-v2-A`, 1, 1],
  );
  const productMaterialId = await insert(
    pool,
    'INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit,is_key_material,need_batch_record) VALUES (?,?,?,?,?,?)',
    [productId, materialId, '1.0000', 'kg', 1, 0],
  );
  const processStepId = await insert(
    pool,
    'INSERT INTO process_steps (step_code,step_name,status) VALUES (?,?,?)',
    [`${token}-step`, 'Production test step', 1],
  );
  const processRouteId = await insert(
    pool,
    'INSERT INTO process_routes (route_code,route_name,version_no,status) VALUES (?,?,?,?)',
    [`${token}-route`, 'Production test route', 'V1', 'enabled'],
  );
  const routeStepId = await insert(
    pool,
    `INSERT INTO process_route_steps
      (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,need_inspection)
     VALUES (?,?,?,?,?,?)`,
    [processRouteId, processStepId, 1, `${token}-step`, 'Production test step', 0],
  );
  const workOrderId = await insert(
    pool,
    'INSERT INTO work_orders (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?,?)',
    [
      `${token}-work-order`,
      'research',
      productId,
      `${token}-product`,
      'Production test product',
      'pcs',
      '10.0000',
      'released',
    ],
  );
  const batchId = await insert(
    pool,
    'INSERT INTO production_batches (work_order_id,product_id,batch_no,planned_quantity) VALUES (?,?,?,?)',
    [workOrderId, productId, `${token}-demand`, '3.0000'],
  );
  const batchStepRecordId = await insert(
    pool,
    `INSERT INTO batch_step_records
      (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,need_inspection_snapshot,unit_snapshot)
     VALUES (?,?,?,?,?,?,?)`,
    [batchId, routeStepId, 1, `${token}-step`, 'Production test step', 0, 'pcs'],
  );
  const [[actor]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM users ORDER BY id LIMIT 1',
  );
  if (!actor) throw new Error('Production MySQL test requires seeded users');
  return {
    token,
    requestId: `${token}-request`,
    productCategoryId,
    materialCategoryId,
    productId,
    materialId,
    materialVariant1Id,
    materialVariant2Id,
    productMaterialId,
    processStepId,
    processRouteId,
    workOrderId,
    batchId,
    batchStepRecordId,
    actorId: actor.id,
    concurrentBatchNo: `${token}-concurrent`,
  };
};

const insert = async (pool: Pool, sql: string, values: ExecuteValues[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const cleanupMassMaterialVersionChoices = async (pool: Pool, workOrderId: number) => {
  const connection = await pool.getConnection();
  try {
    // The choice is intentionally immutable in production. This test-only cleanup runs
    // on the dedicated *_test database after all assertions have observed that invariant.
    await connection.query('DROP TRIGGER trg_work_order_material_versions_reject_delete');
    await connection.execute('DELETE FROM work_order_material_versions WHERE work_order_id=?', [
      workOrderId,
    ]);
  } finally {
    await connection.query(`
      CREATE TRIGGER trg_work_order_material_versions_reject_delete
      BEFORE DELETE ON work_order_material_versions
      FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mass production material choice is immutable'
    `);
    connection.release();
  }
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};

const commandContext = (actorId: number, requestId: string) => ({
  actorId: String(actorId),
  ip: null,
  requestId,
  userAgent: null,
});

const idemCtx = (actorId: number, requestId: string, idempotencyKey: string) => ({
  actorId: String(actorId),
  requestId,
  ip: null,
  userAgent: null,
  idempotencyKey,
});
