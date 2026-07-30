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
      await pool.execute('DELETE FROM production_batches WHERE work_order_id=?', [
        fixture.workOrderId,
      ]);
      await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
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
      'SELECT quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,idempotency_key FROM production_item_demand WHERE production_batch_id=?',
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
        idempotency_key: `NORMAL:${fixture.batchId}:${fixture.productMaterialId}`,
      },
    ]);
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
});

interface Fixture {
  requestId: string;
  productCategoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  productMaterialId: number;
  workOrderId: number;
  batchId: number;
  concurrentBatchNo: string;
}

type DemandRow = RowDataPacket & {
  quantity_per_unit_snapshot: string;
  unit_snapshot: string;
  is_key_material_snapshot: number;
  need_batch_record_snapshot: number;
  planned_output_quantity_snapshot: string;
  need_number: string;
  idempotency_key: string;
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
  return {
    requestId: `${token}-request`,
    productCategoryId,
    materialCategoryId,
    productId,
    materialId,
    productMaterialId,
    workOrderId,
    batchId,
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
