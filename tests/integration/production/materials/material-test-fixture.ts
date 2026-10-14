import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../../apps/api/node_modules/mysql2/promise.js';
import { MysqlIdempotencyExecutor } from '../../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';
import { IdentityDirectoryService } from '../../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductSnapshotService } from '../../../../apps/api/src/modules/product/application/product-snapshot.service.js';
import { MysqlProductSnapshotRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import { ProductionMaterialOutboundService } from '../../../../apps/api/src/modules/production/application/production-material-outbound.service.js';
import { ProductionMaterialService } from '../../../../apps/api/src/modules/production/application/production-material.service.js';
import { MysqlProductionMaterialOutboundRepository } from '../../../../apps/api/src/modules/production/infrastructure/logistics/mysql-production-material-outbound.repository.js';
import { MysqlProductionMaterialRepository } from '../../../../apps/api/src/modules/production/infrastructure/demand/mysql-production-material.repository.js';
import { MysqlProductionExecutionRepository } from '../../../../apps/api/src/modules/production/infrastructure/execution/mysql-production-execution.repository.js';
import { MysqlMaterialVariantRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-material-variant.repository.js';
import { MysqlInventoryStockCommand } from '../../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-stock.command.js';
import { MysqlProductInventoryEligibility } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-inventory-eligibility.query.js';
import {
  deleteFixtureMaterialBasis,
  deleteFixtureMaterialLosses,
} from '../fixtures/production-material-test-cleanup.js';

export const createMaterialTestContext = async (onPoolCreated: (pool: Pool) => void) => {
  const database = req('DB_NAME');
  if (!/(?:_test|_ci)$/.test(database)) {
    throw new Error(
      'production material integration tests require a dedicated *_test or *_ci database',
    );
  }
  const pool: Pool = createPool({
    host: req('DB_HOST'),
    port: Number(req('DB_PORT')),
    user: req('DB_USER'),
    password: req('DB_PASSWORD'),
    database,
    charset: 'utf8mb4_0900_ai_ci',
    timezone: '+08:00',
    connectionLimit: 6,
  });
  // Preserve the original afterAll cleanup if later setup fails.
  onPoolCreated(pool);
  const productEligibility = new MysqlProductInventoryEligibility(pool);
  const materialVariants: MysqlMaterialVariantRepository = new MysqlMaterialVariantRepository(
    pool,
    productEligibility,
  );
  const inventory = new MysqlInventoryStockCommand(pool, productEligibility);
  const repository: MysqlProductionMaterialRepository = new MysqlProductionMaterialRepository(
    pool,
    inventory,
    materialVariants,
    productEligibility,
  );
  const outbounds: MysqlProductionMaterialOutboundRepository =
    new MysqlProductionMaterialOutboundRepository(
      pool,
      inventory,
      productEligibility,
      materialVariants,
    );
  const identity = new IdentityDirectoryService(new MysqlRbacRepository(pool));
  const outboundService: ProductionMaterialOutboundService = new ProductionMaterialOutboundService(
    outbounds,
    identity,
    new MysqlIdempotencyExecutor(pool),
  );
  const execution: MysqlProductionExecutionRepository = new MysqlProductionExecutionRepository(
    pool,
    identity,
  );
  const service: ProductionMaterialService = new ProductionMaterialService(
    repository,
    new ProductSnapshotService(new MysqlProductSnapshotRepository(pool)),
    new MysqlIdempotencyExecutor(pool),
  );
  const [[actor]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM users ORDER BY id LIMIT 1',
  );
  if (!actor) throw new Error('seeded user required');
  const actorId: number = actor.id;
  return {
    pool,
    repository,
    service,
    execution,
    outbounds,
    outboundService,
    materialVariants,
    actorId,
  };
};

export type Fixture = {
  token: string;
  productCategoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  materialVariant1Id: number;
  materialVariant2Id: number;
  productMaterialId: number;
  workOrderId: number;
  batchId: number;
  requirementBasisId: number;
  demandId: number;
  itemBatch1: number;
  itemBatch2: number;
  ownsMaterial: boolean;
  ownsItemBatches: boolean;
};

export const fixture = async (
  pool: Pool,
  actorId: number,
  suffix: string,
  shared?: {
    sharedItemId: number;
    sharedCategoryId: number;
    sharedItemBatchId: number;
    sharedMaterialVariant1Id: number;
    sharedMaterialVariant2Id: number;
  },
): Promise<Fixture> => {
  const token = `pm-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const pc = await ins(
    pool,
    "INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-pc`, '成品'],
  );
  const mc =
    shared?.sharedCategoryId ??
    (await ins(
      pool,
      "INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,'material')",
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
      "INSERT INTO materials (material_code,material_name,category_id,unit,acquire_method) VALUES (?,?,?,'kg','purchased')",
      [`${token}-m`, '物料', mc],
    ));
  const materialVariant1Id =
    shared?.sharedMaterialVariant1Id ??
    (await ins(
      pool,
      "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v1','A',?,?,?)",
      [material, `${token}-m-v1-A`, actorId, actorId],
    ));
  const materialVariant2Id =
    shared?.sharedMaterialVariant2Id ??
    (await ins(
      pool,
      "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v2','A',?,?,?)",
      [material, `${token}-m-v2-A`, actorId, actorId],
    ));
  const pm = await ins(
    pool,
    "INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit) VALUES (?,?,'1.0000','kg')",
    [product, material],
  );
  const wo = await ins(
    pool,
    "INSERT INTO work_orders (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,'10.0000','released')",
    [`${token}-wo`, 'mass_production', product, `${token}-p`, '产品', 'pcs'],
  );
  const batch = await ins(
    pool,
    "INSERT INTO production_batches (work_order_id,product_id,batch_no,planned_quantity,status) VALUES (?,?,?,'10.0000','material_pending')",
    [wo, product, `${token}-batch`],
  );
  const basis = await ins(
    pool,
    `INSERT INTO production_material_requirement_basis
      (production_batch_id,product_material_id,material_id,locked_material_variant_id,material_code_snapshot,
       unit_snapshot,quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by)
     VALUES (?,?,?,?,?,'kg','1.0000','10.0000','10.0000',?)`,
    [batch, pm, material, materialVariant1Id, `${token}-m`, actorId],
  );
  const demand = await ins(
    pool,
    "INSERT INTO production_item_demand (production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,idempotency_key,business_status,created_by,updated_by) VALUES (?,?,?,?,?,?,?,'1.0000','kg','10.0000','10.0000',10,'normal',?,?,'active',?,?)",
    [
      batch,
      basis,
      pm,
      material,
      materialVariant1Id,
      token + '-m',
      `${token}-m-v1-A`,
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
      "INSERT INTO item_batch (item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,?,'kg',?,'purchased',?,?)",
      [
        material,
        materialVariant1Id,
        `${token}-m`,
        `${token}-m-v1-A`,
        `${token}-ib1`,
        actorId,
        actorId,
      ],
    );
    ib2 = await ins(
      pool,
      "INSERT INTO item_batch (item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,?,'kg',?,'purchased',?,?)",
      [
        material,
        materialVariant1Id,
        `${token}-m`,
        `${token}-m-v1-A`,
        `${token}-ib2`,
        actorId,
        actorId,
      ],
    );
    await pool.execute(
      "INSERT INTO inventory_transaction (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?, ?, ?,'purchase_inbound','10.0000','kg','available','manual',0,?,?),(?, ?, ?,'purchase_inbound','10.0000','kg','available','manual',0,?,?)",
      [
        material,
        materialVariant1Id,
        ib1,
        `${token}-opening-1`,
        actorId,
        material,
        materialVariant1Id,
        ib2,
        `${token}-opening-2`,
        actorId,
      ],
    );
  }
  return {
    token,
    productCategoryId: pc,
    materialCategoryId: mc,
    productId: product,
    materialId: material,
    productMaterialId: pm,
    materialVariant1Id,
    materialVariant2Id,
    workOrderId: wo,
    batchId: batch,
    requirementBasisId: basis,
    demandId: demand,
    itemBatch1: ib1,
    itemBatch2: ib2,
    ownsMaterial: !shared,
    ownsItemBatches: !shared,
  };
};

export const cleanup = async (pool: Pool, f: Fixture) => {
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
  await deleteFixtureMaterialLosses(pool, f.batchId);
  await pool.execute('DELETE FROM production_item_allocation WHERE production_batch_id=?', [
    f.batchId,
  ]);
  await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [f.batchId]);
  await pool.execute('DELETE FROM production_manual_demand_addition WHERE production_batch_id=?', [
    f.batchId,
  ]);
  await deleteFixtureMaterialBasis(pool, f.batchId);
  await pool.execute('DELETE FROM production_batches WHERE id=?', [f.batchId]);
  await pool.execute('DELETE FROM work_orders WHERE id=?', [f.workOrderId]);
  await pool.execute('DELETE FROM product_materials WHERE id=?', [f.productMaterialId]);
  if (f.ownsItemBatches) {
    await deleteInventoryTransactions(
      pool,
      'DELETE FROM inventory_transaction WHERE batch_id IN (?,?)',
      [f.itemBatch1, f.itemBatch2],
    );
    await pool.execute('DELETE FROM item_batch WHERE id IN (?,?)', [f.itemBatch1, f.itemBatch2]);
  }
  await pool.execute('DELETE FROM products WHERE id=?', [f.productId]);
  await pool.execute('DELETE FROM item_categories WHERE id=?', [f.productCategoryId]);
  if (f.ownsMaterial) {
    await pool.execute('DELETE FROM material_variants WHERE material_id=?', [f.materialId]);
    await pool.execute('DELETE FROM materials WHERE id=?', [f.materialId]);
    await pool.execute('DELETE FROM item_categories WHERE id=?', [f.materialCategoryId]);
  }
};

export const deleteInventoryTransactions = async (pool: Pool, sql: string, values: unknown[]) => {
  const connection: PoolConnection = await pool.getConnection();
  try {
    await connection.query('SET @company_inventory_test_cleanup = 1');
    await connection.execute(sql, values as never);
  } finally {
    await connection.query('SET @company_inventory_test_cleanup = NULL');
    connection.release();
  }
};

export const ins = async (pool: Pool, sql: string, values: unknown[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values as never);
  return Number(result.insertId);
};

export const ctx = (actorId: number, requestId: string) => ({
  actorId: String(actorId),
  requestId,
  ip: null,
  userAgent: null,
});

export const idemCtx = (actorId: number, requestId: string, idempotencyKey: string) => ({
  ...ctx(actorId, requestId),
  idempotencyKey,
});

const req = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
