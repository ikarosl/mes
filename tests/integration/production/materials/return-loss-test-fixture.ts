import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../../apps/api/node_modules/mysql2/promise.js';
import { MysqlProductionMaterialLossRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material-loss.repository.js';
import { MysqlProductionReturnRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-return.repository.js';
import { MysqlInventoryStockCheckRepository } from '../../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-stock-check.repository.js';
import { MysqlInventoryStockCommand } from '../../../../apps/api/src/modules/inventory/infrastructure/mysql-inventory-stock.command.js';
import { MysqlProductInventoryEligibility } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-inventory-eligibility.query.js';
import {
  deleteFixtureMaterialBasis,
  deleteFixtureMaterialLosses,
} from '../fixtures/production-material-test-cleanup.js';

export const createReturnLossTestContext = async (
  onPoolCreated: (pool: Pool) => void,
  onActorUsernameCreated: (actorUsername: string) => void,
) => {
  const pool: Pool = createPool({
    host: req('DB_HOST'),
    port: Number(req('DB_PORT')),
    user: req('DB_USER'),
    password: req('DB_PASSWORD'),
    database: req('DB_NAME'),
    charset: 'utf8mb4_0900_ai_ci',
    timezone: '+08:00',
    connectionLimit: 4,
  });
  // Preserve the original afterAll cleanup if later setup fails.
  onPoolCreated(pool);
  const productEligibility: MysqlProductInventoryEligibility = new MysqlProductInventoryEligibility(
    pool,
  );
  const inventoryStock = new MysqlInventoryStockCommand(pool, productEligibility);
  const returnRepository: MysqlProductionReturnRepository = new MysqlProductionReturnRepository(
    pool,
    inventoryStock,
  );
  const stockCheckRepository: MysqlInventoryStockCheckRepository =
    new MysqlInventoryStockCheckRepository(pool, inventoryStock);
  const lossRepository: MysqlProductionMaterialLossRepository =
    new MysqlProductionMaterialLossRepository(pool);
  const actorUsername: string = `return-stock-actor-${Date.now()}`;
  onActorUsernameCreated(actorUsername);
  const actorId: number = await insert(
    pool,
    'INSERT INTO users(username,password_hash,display_name) VALUES (?,?,?)',
    [actorUsername, 'integration-test-only', '退料盘点测试员'],
  );
  return {
    pool,
    returnRepository,
    stockCheckRepository,
    productEligibility,
    lossRepository,
    actorId,
    actorUsername,
  };
};

type Fixture = {
  token: string;
  productCategoryId: number;
  materialCategoryId: number;
  productId: number;
  materialId: number;
  materialVariantId: number;
  productMaterialId: number;
  requirementBasisId: number;
  workOrderId: number;
  productionBatchId: number;
  demandId: number;
  itemBatchId: number;
  allocationId: number;
  outboundOrderId: number;
};

export async function createFixture(pool: Pool, actorId: number): Promise<Fixture> {
  const token = `return-stock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const productCategoryId = await insert(
    pool,
    "INSERT INTO item_categories(category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-pc`, '成品'],
  );
  const materialCategoryId = await insert(
    pool,
    "INSERT INTO item_categories(category_code,category_name,item_kind) VALUES (?,?,'material')",
    [`${token}-mc`, '原料'],
  );
  const productId = await insert(
    pool,
    "INSERT INTO products(item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'pcs','self_made')",
    [`${token}-p`, '成品', productCategoryId],
  );
  const materialId = await insert(
    pool,
    "INSERT INTO materials(material_code,material_name,category_id,unit,acquire_method) VALUES (?,?,?,'kg','purchased')",
    [`${token}-m`, '原料', materialCategoryId],
  );
  const materialVariantId = await insert(
    pool,
    "INSERT INTO material_variants(material_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v1','A',?,?,?)",
    [materialId, `${token}-m-v1-A`, actorId, actorId],
  );
  const productMaterialId = await insert(
    pool,
    "INSERT INTO product_materials(product_id,material_id,quantity_per_unit,unit) VALUES (?,?,'1.0000','kg')",
    [productId, materialId],
  );
  const workOrderId = await insert(
    pool,
    "INSERT INTO work_orders(work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,?,'10.0000','released')",
    [`${token}-wo`, 'mass_production', productId, `${token}-p`, '成品', 'pcs'],
  );
  const productionBatchId = await insert(
    pool,
    "INSERT INTO production_batches(work_order_id,product_id,batch_no,planned_quantity,status) VALUES (?,?,?,'10.0000','material_outbound')",
    [workOrderId, productId, `${token}-batch`],
  );
  const requirementBasisId = await insert(
    pool,
    `INSERT INTO production_material_requirement_basis
      (production_batch_id,product_material_id,material_id,locked_material_variant_id,material_code_snapshot,
       unit_snapshot,quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by)
     VALUES (?,?,?,?,?,'kg','1.0000','10.0000','10.0000',?)`,
    [productionBatchId, productMaterialId, materialId, materialVariantId, `${token}-m`, actorId],
  );
  const demandId = await insert(
    pool,
    "INSERT INTO production_item_demand(production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,idempotency_key,business_status,created_by,updated_by) VALUES (?,?,?,?,?,?,?,'1.0000','kg','10.0000','10.0000',10,'normal',?,?,'active',?,?)",
    [
      productionBatchId,
      requirementBasisId,
      productMaterialId,
      materialId,
      materialVariantId,
      token + '-m',
      `${token}-m-v1-A`,
      `NORMAL:${productionBatchId}`,
      `NORMAL:${productionBatchId}:${productMaterialId}`,
      actorId,
      actorId,
    ],
  );
  const itemBatchId = await insert(
    pool,
    "INSERT INTO item_batch(item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,?,'kg',?,'purchased',?,?)",
    [
      materialId,
      materialVariantId,
      `${token}-m`,
      `${token}-m-v1-A`,
      `${token}-ib`,
      actorId,
      actorId,
    ],
  );
  await pool.execute(
    "INSERT INTO inventory_transaction(item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,?,'purchase_inbound','10.0000','kg','available','manual',0,?,?)",
    [materialId, materialVariantId, itemBatchId, `${token}-opening`, actorId],
  );
  const allocationId = await insert(
    pool,
    "INSERT INTO production_item_allocation(demand_id,production_batch_id,item_id,material_variant_id,batch_id,assigned_number,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,'5.0000','kg',?,?)",
    [demandId, productionBatchId, materialId, materialVariantId, itemBatchId, actorId, actorId],
  );
  const outboundOrderId = await insert(
    pool,
    "INSERT INTO outbound_order(outbound_no,production_batch_id,work_order_id,status,outbound_at,operator_id,created_by,updated_by) VALUES (?,?,?,'completed',CURRENT_TIMESTAMP,?,?,?)",
    [`${token}-out`, productionBatchId, workOrderId, actorId, actorId, actorId],
  );
  const outboundDetailId = await insert(
    pool,
    "INSERT INTO outbound_detail(outbound_id,production_batch_id,demand_id,allocation_id,item_id,material_variant_id,batch_id,outbound_number,unit_snapshot,created_by) VALUES (?,?,?,?,?,?,?,'5.0000','kg',?)",
    [
      outboundOrderId,
      productionBatchId,
      demandId,
      allocationId,
      materialId,
      materialVariantId,
      itemBatchId,
      actorId,
    ],
  );
  await pool.execute(
    "INSERT INTO inventory_transaction(item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,created_by) VALUES (?,?,?,'production_material_outbound','-5.0000','kg','available','outbound_detail',?,?,?)",
    [
      materialId,
      materialVariantId,
      itemBatchId,
      outboundDetailId,
      `${token}-outbound-ledger`,
      actorId,
    ],
  );
  return {
    token,
    productCategoryId,
    materialCategoryId,
    productId,
    materialId,
    materialVariantId,
    requirementBasisId,
    productMaterialId,
    workOrderId,
    productionBatchId,
    demandId,
    itemBatchId,
    allocationId,
    outboundOrderId,
  };
}

export async function cleanup(pool: Pool, fixture: Fixture) {
  await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${fixture.token}-%`]);
  await deleteInventoryTransactions(pool, 'DELETE FROM inventory_transaction WHERE batch_id=?', [
    fixture.itemBatchId,
  ]);
  const [stockChecks] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT DISTINCT stock_check_id id FROM stock_check_detail WHERE batch_id=?',
    [fixture.itemBatchId],
  );
  await pool.execute('DELETE FROM stock_check_detail WHERE batch_id=?', [fixture.itemBatchId]);
  if (stockChecks.length) {
    await pool.execute(
      `DELETE FROM stock_check_order WHERE id IN (${stockChecks.map(() => '?').join(',')})`,
      stockChecks.map((row) => row.id),
    );
  }
  await pool.execute('DELETE FROM return_detail WHERE production_batch_id=?', [
    fixture.productionBatchId,
  ]);
  await pool.execute('DELETE FROM return_order WHERE production_batch_id=?', [
    fixture.productionBatchId,
  ]);
  await pool.execute('DELETE FROM outbound_detail WHERE outbound_id=?', [fixture.outboundOrderId]);
  await pool.execute('DELETE FROM outbound_order WHERE id=?', [fixture.outboundOrderId]);
  await deleteFixtureMaterialLosses(pool, fixture.productionBatchId);
  await pool.execute('DELETE FROM production_item_allocation WHERE id=?', [fixture.allocationId]);
  await pool.execute('DELETE FROM production_item_demand WHERE id=?', [fixture.demandId]);
  await pool.execute('DELETE FROM item_batch WHERE id=?', [fixture.itemBatchId]);
  await deleteFixtureMaterialBasis(pool, fixture.productionBatchId);
  await pool.execute('DELETE FROM production_batches WHERE id=?', [fixture.productionBatchId]);
  await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
  await pool.execute('DELETE FROM product_materials WHERE id=?', [fixture.productMaterialId]);
  await pool.execute('DELETE FROM material_variants WHERE material_id=?', [fixture.materialId]);
  await pool.execute('DELETE FROM products WHERE id=?', [fixture.productId]);
  await pool.execute('DELETE FROM materials WHERE id=?', [fixture.materialId]);
  await pool.execute('DELETE FROM item_categories WHERE id IN (?,?)', [
    fixture.productCategoryId,
    fixture.materialCategoryId,
  ]);
}

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

export async function insert(pool: Pool, sql: string, values: unknown[]) {
  const [result] = await pool.execute<ResultSetHeader>(sql, values as never);
  return Number(result.insertId);
}

export const context = (actorId: number, requestId: string) => ({
  actorId: String(actorId),
  requestId,
  ip: null,
  userAgent: null,
});

const req = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
