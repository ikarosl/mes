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

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production MySQL persistence', () => {
  let pool: Pool;
  let repository: MysqlProductionBatchRepository;
  let fixture: Fixture;

  beforeAll(async () => {
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database: requiredEnv('DB_NAME'),
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 4,
    });
    repository = new MysqlProductionBatchRepository(pool);
    fixture = await createFixture(pool);
  });

  afterAll(async () => {
    if (pool && fixture) {
      await pool.execute('DELETE FROM operation_logs WHERE request_id=?', [fixture.requestId]);
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        fixture.batchId,
      ]);
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
      await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
      await pool.execute('DELETE FROM process_route_steps WHERE route_id=?', [
        fixture.processRouteId,
      ]);
      await pool.execute('DELETE FROM process_routes WHERE id=?', [fixture.processRouteId]);
      await pool.execute('DELETE FROM process_steps WHERE id=?', [fixture.processStepId]);
      await pool.execute('DELETE FROM product_materials WHERE product_id=?', [fixture.productId]);
      await pool.execute('DELETE FROM products WHERE id IN (?,?)', [
        fixture.productId,
        fixture.materialId,
      ]);
      await pool.execute('DELETE FROM product_categories WHERE id IN (?,?)', [
        fixture.productCategoryId,
        fixture.materialCategoryId,
      ]);
    }
    await pool?.end();
  });

  it('persists BOM and batch snapshots with a stable demand key, then avoids duplicate generation', async () => {
    const bom = {
      product: { id: String(fixture.productId) },
      lines: [
        {
          productMaterialId: String(fixture.productMaterialId),
          materialProductId: String(fixture.materialId),
          quantityPerUnit: '0.1000',
          unit: 'kg',
          isKeyMaterial: true,
          needBatchRecord: false,
        },
      ],
    };
    const commandContext: CommandContext = {
      actorId: null,
      ip: null,
      requestId: fixture.requestId,
      userAgent: null,
    };

    await repository.generateMaterialDemands(
      String(fixture.batchId),
      0,
      bom as never,
      commandContext,
    );
    await repository.generateMaterialDemands(
      String(fixture.batchId),
      1,
      bom as never,
      commandContext,
    );

    const [demands] = await pool.query<DemandRow[]>(
      'SELECT quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,demand_type,idempotency_key FROM production_item_demand WHERE production_batch_id=?',
      [fixture.batchId],
    );
    expect(demands).toEqual([
      {
        quantity_per_unit_snapshot: '0.1000',
        unit_snapshot: 'kg',
        is_key_material_snapshot: 1,
        need_batch_record_snapshot: 0,
        planned_output_quantity_snapshot: '3.0000',
        need_number: '0.3000',
        demand_type: 'normal',
        idempotency_key: `NORMAL:${fixture.batchId}:${fixture.productMaterialId}`,
      },
    ]);
    const [[demandTypeColumn]] = await pool.query<
      (RowDataPacket & { data_type_value: string; column_default_value: string })[]
    >(
      `SELECT data_type AS data_type_value,column_default AS column_default_value
       FROM information_schema.columns
       WHERE table_schema=DATABASE() AND table_name='production_item_demand'
         AND column_name='demand_type'`,
    );
    expect(demandTypeColumn).toEqual({
      data_type_value: 'varchar',
      column_default_value: 'normal',
    });
    await expect(
      pool.execute(
        "UPDATE production_item_demand SET demand_type='manual_additional' WHERE production_batch_id=?",
        [fixture.batchId],
      ),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    const [[batch]] = await pool.query<(RowDataPacket & { status: string; version: number })[]>(
      'SELECT status,version FROM production_batches WHERE id=?',
      [fixture.batchId],
    );
    expect(batch).toEqual({ status: 'material_pending', version: 1 });
  });

  it('serializes concurrent batch creation by locking the work order and duplicate batch number', async () => {
    const payload = { batchNo: fixture.concurrentBatchNo, plannedQuantity: 1 };
    const commandContext: CommandContext = {
      actorId: null,
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
  requestId: string;
  productCategoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  productMaterialId: number;
  processStepId: number;
  processRouteId: number;
  workOrderId: number;
  batchId: number;
  batchStepRecordId: number;
  actorId: number;
  concurrentBatchNo: string;
}

type DemandRow = RowDataPacket & {
  quantity_per_unit_snapshot: string;
  unit_snapshot: string;
  is_key_material_snapshot: number;
  need_batch_record_snapshot: number;
  planned_output_quantity_snapshot: string;
  need_number: string;
  demand_type: string;
  idempotency_key: string;
};

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
    'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,?,?)',
    [`${token}-material`, 'Production test material', materialCategoryId, 'kg', 'purchased'],
  );
  const productMaterialId = await insert(
    pool,
    'INSERT INTO product_materials (product_id,material_product_id,quantity_per_unit,unit,is_key_material,need_batch_record) VALUES (?,?,?,?,?,?)',
    [productId, materialId, '0.1000', 'kg', 1, 0],
  );
  const processStepId = await insert(
    pool,
    'INSERT INTO process_steps (step_code,step_name,status) VALUES (?,?,?)',
    [`${token}-step`, 'Production test step', 1],
  );
  const processRouteId = await insert(
    pool,
    'INSERT INTO process_routes (product_id,route_code,route_name,version_no,status) VALUES (?,?,?,?,?)',
    [productId, `${token}-route`, 'Production test route', 'V1', 'enabled'],
  );
  const routeStepId = await insert(
    pool,
    `INSERT INTO process_route_steps
      (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,need_record,need_inspection)
     VALUES (?,?,?,?,?,?,?)`,
    [processRouteId, processStepId, 1, `${token}-step`, 'Production test step', 1, 0],
  );
  const workOrderId = await insert(
    pool,
    'INSERT INTO work_orders (work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,?)',
    [
      `${token}-work-order`,
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
      (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,need_record_snapshot,need_inspection_snapshot,unit_snapshot)
     VALUES (?,?,?,?,?,?,?,?)`,
    [batchId, routeStepId, 1, `${token}-step`, 'Production test step', 1, 0, 'pcs'],
  );
  const [[actor]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM users ORDER BY id LIMIT 1',
  );
  if (!actor) throw new Error('Production MySQL test requires seeded users');
  return {
    requestId: `${token}-request`,
    productCategoryId,
    materialCategoryId,
    productId,
    materialId,
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

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
