import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll } from 'vitest';
import { MysqlProductionExecutionRepository } from '../../../../apps/api/src/modules/production/infrastructure/execution/mysql-production-execution.repository.js';
import { MysqlProductionReportingRepository } from '../../../../apps/api/src/modules/production/infrastructure/execution/mysql-production-reporting.repository.js';
import { MysqlProductionAbnormalRepository } from '../../../../apps/api/src/modules/production/infrastructure/execution/mysql-production-abnormal.repository.js';
import { MysqlProductionSupplementRepository } from '../../../../apps/api/src/modules/production/infrastructure/execution/mysql-production-supplement.repository.js';
import { MysqlProductionMaterialOutboundRepository } from '../../../../apps/api/src/modules/production/infrastructure/logistics/mysql-production-material-outbound.repository.js';
import { MysqlProductionMaterialRepository } from '../../../../apps/api/src/modules/production/infrastructure/demand/mysql-production-material.repository.js';
import { MysqlIdempotencyExecutor } from '../../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';
import { IdentityDirectoryService } from '../../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductionReportingService } from '../../../../apps/api/src/modules/production/application/production-reporting.service.js';
import { ProductionSupplementService } from '../../../../apps/api/src/modules/production/application/production-supplement.service.js';
import { MysqlMaterialVariantRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-material-variant.repository.js';
import {
  deleteFixtureMaterialBasis,
  deleteFixtureStepExecutionActions,
} from '../fixtures/production-material-test-cleanup.js';

interface ProductionExecutionTestContext {
  pool: Pool;
  repository: MysqlProductionExecutionRepository;
  reporting: MysqlProductionReportingRepository;
  abnormal: MysqlProductionAbnormalRepository;
  supplement: MysqlProductionSupplementRepository;
  materials: MysqlProductionMaterialRepository;
  outbounds: MysqlProductionMaterialOutboundRepository;
  reportingService: ProductionReportingService;
  supplementService: ProductionSupplementService;
}

export const setupProductionExecutionSuite = (): (() => ProductionExecutionTestContext) => {
  let pool: Pool;
  let repository: MysqlProductionExecutionRepository;
  let reporting: MysqlProductionReportingRepository;
  let abnormal: MysqlProductionAbnormalRepository;
  let supplement: MysqlProductionSupplementRepository;
  let materials: MysqlProductionMaterialRepository;
  let outbounds: MysqlProductionMaterialOutboundRepository;
  let reportingService: ProductionReportingService;
  let supplementService: ProductionSupplementService;

  beforeAll(() => {
    const database = required('DB_NAME');
    if (!/(?:_test|_ci)$/.test(database)) {
      throw new Error(
        'production execution integration tests require a dedicated *_test or *_ci database',
      );
    }
    pool = createPool({
      host: required('DB_HOST'),
      port: Number(required('DB_PORT')),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
      database,
      charset: 'utf8mb4_0900_ai_ci',
      timezone: '+08:00',
      connectionLimit: 6,
    });
    const identity = new IdentityDirectoryService(new MysqlRbacRepository(pool));
    repository = new MysqlProductionExecutionRepository(pool, identity);
    reporting = new MysqlProductionReportingRepository(pool);
    abnormal = new MysqlProductionAbnormalRepository(pool);
    supplement = new MysqlProductionSupplementRepository(
      pool,
      new MysqlMaterialVariantRepository(pool),
    );
    materials = new MysqlProductionMaterialRepository(pool);
    outbounds = new MysqlProductionMaterialOutboundRepository(pool);
    reportingService = new ProductionReportingService(
      reporting,
      identity,
      new MysqlIdempotencyExecutor(pool),
    );
    supplementService = new ProductionSupplementService(
      supplement,
      new MysqlIdempotencyExecutor(pool),
    );
  });

  afterAll(async () => pool?.end());

  return () => ({
    pool,
    repository,
    reporting,
    abnormal,
    supplement,
    materials,
    outbounds,
    reportingService,
    supplementService,
  });
};

type Fixture = {
  token: string;
  actorId: number;
  workerId: number;
  otherWorkerId: number;
  categoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  materialVariantId: number;
  productMaterialId: number;
  requirementBasisId: number;
  processStepIds: [number, number];
  routeId: number;
  routeStepIds: [number, number];
  workOrderId: number;
  batchId: number;
  demandId: number;
  firstStepRecordId: number;
  secondStepRecordId: number;
};

export const createFixture = async (
  pool: Pool,
  repository: MysqlProductionExecutionRepository,
  suffix: string,
  options: { autoStart?: boolean } = {},
): Promise<Fixture> => {
  const token = `pe-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [[actor]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM users ORDER BY id LIMIT 1',
  );
  if (!actor) throw new Error('seeded user required');
  const workerId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-worker`, 'not-used-by-test', 'Execution worker'],
  );
  const otherWorkerId = await insert(
    pool,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-other`, 'not-used-by-test', 'Other worker'],
  );
  const categoryId = await insert(
    pool,
    "INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-category`, 'Execution category'],
  );
  const productId = await insert(
    pool,
    "INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'pcs','self_made')",
    [`${token}-product`, 'Execution product', categoryId],
  );
  const materialCategoryId = await insert(
    pool,
    "INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,'material')",
    [`${token}-mc`, 'Execution material category'],
  );
  const materialId = await insert(
    pool,
    "INSERT INTO materials (material_code,material_name,category_id,unit,acquire_method) VALUES (?,?,?,'kg','purchased')",
    [`${token}-m`, 'Execution material', materialCategoryId],
  );
  const materialVariantId = await insert(
    pool,
    "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v1','A',?,?,?)",
    [materialId, `${token}-m-v1-A`, actor.id, actor.id],
  );
  const productMaterialId = await insert(
    pool,
    "INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit) VALUES (?,?,'1.0000','kg')",
    [productId, materialId],
  );
  const firstProcessStepId = await insert(
    pool,
    'INSERT INTO process_steps (step_code,step_name,status) VALUES (?,?,1)',
    [`${token}-step-1`, 'Execution step 1'],
  );
  const secondProcessStepId = await insert(
    pool,
    'INSERT INTO process_steps (step_code,step_name,status) VALUES (?,?,1)',
    [`${token}-step-2`, 'Execution step 2'],
  );
  const routeId = await insert(
    pool,
    "INSERT INTO process_routes (route_code,route_name,version_no,status) VALUES (?,?,?,'enabled')",
    [`${token}-route`, 'Execution route', 'V1'],
  );
  const firstRouteStepId = await insert(
    pool,
    'INSERT INTO process_route_steps (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,need_inspection) VALUES (?,?,?,?,?,0)',
    [routeId, firstProcessStepId, 1, `${token}-step-1`, 'Execution step 1'],
  );
  const secondRouteStepId = await insert(
    pool,
    'INSERT INTO process_route_steps (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,need_inspection) VALUES (?,?,?,?,?,0)',
    [routeId, secondProcessStepId, 2, `${token}-step-2`, 'Execution step 2'],
  );
  const workOrderId = await insert(
    pool,
    "INSERT INTO work_orders (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,'10.0000','released')",
    [`${token}-wo`, 'mass_production', productId, `${token}-product`, 'Execution product', 'pcs'],
  );
  const batchId = await insert(
    pool,
    "INSERT INTO production_batches (work_order_id,product_id,batch_no,route_id,planned_quantity,status) VALUES (?,?,?,?,'10.0000','material_outbound')",
    [workOrderId, productId, `${token}-batch`, routeId],
  );
  const requirementBasisId = await insert(
    pool,
    `INSERT INTO production_material_requirement_basis
      (production_batch_id,product_material_id,material_id,locked_material_variant_id,material_code_snapshot,
       unit_snapshot,quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by)
     VALUES (?,?,?,?,?,'kg','1.0000','10.0000','10.0000',?)`,
    [batchId, productMaterialId, materialId, materialVariantId, `${token}-m`, actor.id],
  );
  const firstStepRecordId = await insert(
    pool,
    'INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,0,?,?,?)',
    [
      batchId,
      firstRouteStepId,
      1,
      `${token}-step-1`,
      'Execution step 1',
      'pcs',
      actor.id,
      actor.id,
    ],
  );
  const demandId = await insert(
    pool,
    "INSERT INTO production_item_demand (production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,idempotency_key,business_status,fulfilled_by,fulfilled_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,'1.0000','kg','10.0000','10.0000',0,'normal',?,?,'fulfilled',?,NOW(),?,?)",
    [
      batchId,
      requirementBasisId,
      productMaterialId,
      materialId,
      materialVariantId,
      'EXEC-MATERIAL',
      `${token}-m-v1-A`,
      `NORMAL:${batchId}`,
      `NORMAL:${batchId}:${productMaterialId}`,
      actor.id,
      actor.id,
      actor.id,
    ],
  );
  const secondStepRecordId = await insert(
    pool,
    'INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,0,?,?,?)',
    [
      batchId,
      secondRouteStepId,
      2,
      `${token}-step-2`,
      'Execution step 2',
      'pcs',
      actor.id,
      actor.id,
    ],
  );
  const fixture: Fixture = {
    token,
    actorId: actor.id,
    workerId,
    otherWorkerId,
    categoryId,
    materialCategoryId,
    productId,
    materialId,
    materialVariantId,
    productMaterialId,
    requirementBasisId,
    processStepIds: [firstProcessStepId, secondProcessStepId],
    routeId,
    routeStepIds: [firstRouteStepId, secondRouteStepId],
    workOrderId,
    batchId,
    demandId,
    firstStepRecordId,
    secondStepRecordId,
  };
  if (options.autoStart !== false) {
    const startCheck = await repository.getStartCheck(String(batchId));
    await repository.startExecution(
      String(batchId),
      { version: startCheck.version },
      context(actor.id, `${token}-admin-start`),
    );
  }
  return fixture;
};

export const completeRequiredSteps = async (
  repository: MysqlProductionExecutionRepository,
  reporting: MysqlProductionReportingRepository,
  fixture: Fixture,
): Promise<void> => {
  for (const [index, stepRecordId] of [
    fixture.firstStepRecordId,
    fixture.secondStepRecordId,
  ].entries()) {
    await repository.assignStep(
      String(fixture.batchId),
      String(stepRecordId),
      String(fixture.workerId),
      0,
      context(fixture.actorId, `${fixture.token}-complete-assign-${index}`),
    );
    await repository.startStep(
      String(fixture.batchId),
      String(stepRecordId),
      1,
      context(fixture.workerId, `${fixture.token}-complete-start-${index}`),
    );
    await reporting.createReport(
      String(fixture.batchId),
      String(stepRecordId),
      { version: 2, normalQuantity: 10, abnormalQuantity: 0, remark: null },
      context(fixture.workerId, `${fixture.token}-complete-report-${index}`),
    );
    await repository.completeStep(
      String(fixture.batchId),
      String(stepRecordId),
      3,
      context(fixture.actorId, `${fixture.token}-complete-step-${index}`),
      true,
    );
  }
};

export const cleanup = async (pool: Pool, fixture: Fixture): Promise<void> => {
  await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${fixture.token}%`]);
  await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
    `${fixture.token}%`,
  ]);
  await pool.execute('DELETE FROM rework_records WHERE production_batch_id=?', [fixture.batchId]);
  await deleteInventoryTransactions(
    pool,
    "DELETE FROM inventory_transaction WHERE reference_type='outbound_detail' AND reference_detail_id IN (SELECT id FROM outbound_detail WHERE production_batch_id=?)",
    [fixture.batchId],
  );
  await pool.execute('DELETE FROM outbound_detail WHERE production_batch_id=?', [fixture.batchId]);
  await pool.execute('DELETE FROM outbound_order WHERE production_batch_id=?', [fixture.batchId]);
  await pool.execute('DELETE FROM production_item_allocation WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await pool.execute(
    "DELETE FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
    [fixture.batchId],
  );
  await pool.execute(
    'DELETE FROM production_scrap_supplement_plan_line WHERE production_batch_id=?',
    [fixture.batchId],
  );
  await pool.execute('DELETE FROM production_scrap_supplement_plan WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await pool.execute(
    'DELETE FROM batch_step_scrap_reproduction_authorization WHERE production_batch_id=?',
    [fixture.batchId],
  );
  await pool.execute('DELETE FROM production_material_supplement WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await pool.execute('DELETE FROM batch_step_scrap_records WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await deleteFixtureMaterialBasis(pool, fixture.batchId);
  await pool.execute('DELETE FROM batch_step_abnormal_dispositions WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await pool.execute(
    'DELETE FROM batch_step_reports WHERE production_batch_id=? AND (reversal_of_report_id IS NOT NULL OR replaces_report_id IS NOT NULL)',
    [fixture.batchId],
  );
  await pool.execute('DELETE FROM batch_step_reports WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await deleteFixtureStepExecutionActions(pool, fixture.batchId);
  await pool.execute('DELETE FROM batch_step_records WHERE production_batch_id=?', [
    fixture.batchId,
  ]);
  await pool.execute('DELETE FROM production_batches WHERE id=?', [fixture.batchId]);
  await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
  const [itemBatches] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM item_batch WHERE batch_code LIKE ?',
    [`${fixture.token}%`],
  );
  if (itemBatches.length) {
    const ids = itemBatches.map((row) => row.id);
    await deleteInventoryTransactions(
      pool,
      `DELETE FROM inventory_transaction WHERE batch_id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    await pool.query(`DELETE FROM item_batch WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  await pool.execute('DELETE FROM process_route_steps WHERE route_id=?', [fixture.routeId]);
  await pool.execute('DELETE FROM process_routes WHERE id=?', [fixture.routeId]);
  await pool.execute('DELETE FROM process_steps WHERE id IN (?,?)', fixture.processStepIds);
  await pool.execute('DELETE FROM product_materials WHERE id=?', [fixture.productMaterialId]);
  await pool.execute('DELETE FROM products WHERE id=?', [fixture.productId]);
  await pool.execute('DELETE FROM material_variants WHERE material_id=?', [fixture.materialId]);
  await pool.execute('DELETE FROM materials WHERE id=?', [fixture.materialId]);
  await pool.execute('DELETE FROM item_categories WHERE id=?', [fixture.categoryId]);
  await pool.execute('DELETE FROM item_categories WHERE id=?', [fixture.materialCategoryId]);
  await pool.execute('DELETE FROM users WHERE id IN (?,?)', [
    fixture.workerId,
    fixture.otherWorkerId,
  ]);
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

export const insert = async (pool: Pool, sql: string, values: unknown[]): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values as never);
  return Number(result.insertId);
};

export const context = (actorId: number, requestId: string) => ({
  actorId: String(actorId),
  requestId,
  ip: null,
  userAgent: null,
});
export const idempotentContext = (actorId: number, requestId: string, idempotencyKey: string) => ({
  ...context(actorId, requestId),
  idempotencyKey,
});

export const auditCount = async (
  pool: Pool,
  requestId: string,
  action: string,
): Promise<number> => {
  const [[row]] = await pool.query<(RowDataPacket & { count: number })[]>(
    'SELECT COUNT(*) count FROM operation_logs WHERE request_id=? AND action=?',
    [requestId, action],
  );
  return Number(row?.count ?? 0);
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
