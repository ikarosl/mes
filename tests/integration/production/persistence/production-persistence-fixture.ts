import {
  type ExecuteValues,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../../apps/api/node_modules/mysql2/promise.js';
import { type MysqlProductionBatchRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-batch.repository.js';
import { type MysqlProductionMaterialDemandConfigurationRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material-demand-configuration.repository.js';
import { type ProductionMaterialDemandService } from '../../../../apps/api/src/modules/production/application/production-material-demand.service.js';

export interface ProductionPersistenceContext {
  pool: Pool;
  repository: MysqlProductionBatchRepository;
  demandRepository: MysqlProductionMaterialDemandConfigurationRepository;
  demandService: ProductionMaterialDemandService;
  fixture: Fixture;
}

export interface Fixture {
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

export type DispositionRow = RowDataPacket & {
  review_status: string;
  disposition_type: string | null;
  reviewed_by: number | null;
  version: number;
};

export const createFixture = async (pool: Pool): Promise<Fixture> => {
  const token = `production-test-${Date.now()}-${process.pid}`;
  const actorId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name,status) VALUES (?,?,?,1)',
    [`${token}-actor`, 'hash', `${token} actor`],
  );
  const productCategoryId = await insert(
    pool,
    'INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
    [`${token}-finished`, 'Production test finished', 'finished_product'],
  );
  const materialCategoryId = await insert(
    pool,
    'INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,?)',
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
    [materialId, `${token}-material-v1-A`, actorId, actorId],
  );
  const materialVariant2Id = await insert(
    pool,
    "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v2','A',?,?,?)",
    [materialId, `${token}-material-v2-A`, actorId, actorId],
  );
  const productMaterialId = await insert(
    pool,
    'INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit) VALUES (?,?,?,?)',
    [productId, materialId, '1.0000', 'kg'],
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
    actorId,
    concurrentBatchNo: `${token}-concurrent`,
  };
};

export const insert = async (pool: Pool, sql: string, values: ExecuteValues[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

export const cleanupMassMaterialVersionChoices = async (pool: Pool, workOrderId: number) => {
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

export const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};

export const commandContext = (actorId: number, requestId: string) => ({
  actorId: String(actorId),
  ip: null,
  requestId,
  userAgent: null,
});

export const idemCtx = (actorId: number, requestId: string, idempotencyKey: string) => ({
  actorId: String(actorId),
  requestId,
  ip: null,
  userAgent: null,
  idempotencyKey,
});
