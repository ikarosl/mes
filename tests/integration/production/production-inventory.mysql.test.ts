import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MysqlProductionInventoryRepository } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-inventory.repository.js';
import { getNetConfirmedMaterialOutboundQuantity } from '../../../apps/api/src/modules/production/infrastructure/mysql-production-short-batch.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production return and stock-check MySQL transactions', () => {
  let pool: Pool;
  let repository: MysqlProductionInventoryRepository;
  let actorId: number;
  let actorUsername: string;

  beforeAll(async () => {
    pool = createPool({
      host: req('DB_HOST'),
      port: Number(req('DB_PORT')),
      user: req('DB_USER'),
      password: req('DB_PASSWORD'),
      database: req('DB_NAME'),
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 4,
    });
    repository = new MysqlProductionInventoryRepository(pool);
    actorUsername = `return-stock-actor-${Date.now()}`;
    actorId = await insert(
      pool,
      'INSERT INTO users(username,password_hash,display_name) VALUES (?,?,?)',
      [actorUsername, 'integration-test-only', '退料盘点测试员'],
    );
  });

  afterAll(async () => {
    if (pool && actorUsername)
      await pool.execute('DELETE FROM users WHERE username=?', [actorUsername]);
    await pool?.end();
  });

  it('returns confirmed material and completes a stock check with one atomic adjustment', async () => {
    const fixture = await createFixture(pool, actorId);
    try {
      const candidates = await repository.listReturnCandidates(String(fixture.productionBatchId));
      expect(candidates).toHaveLength(1);
      expect(Number(candidates[0]?.returnableQuantity)).toBe(5);

      const pendingReturn = await repository.createReturnOrder(
        {
          productionBatchId: String(fixture.productionBatchId),
          details: [{ allocationId: String(fixture.allocationId), returnQuantity: 3 }],
        },
        context(actorId, `${fixture.token}-return-create`),
      );
      expect(pendingReturn.status).toBe('pending');
      expect(pendingReturn.details[0]?.returnStockStatus).toBe('available');
      expect(pendingReturn.details[0]?.releaseAfterReturn).toBe(true);

      const confirmedReturn = await repository.confirmReturnOrder(
        pendingReturn.id,
        pendingReturn.version,
        context(actorId, `${fixture.token}-return-confirm`),
      );
      expect(confirmedReturn.status).toBe('returned');
      const [[returnLedger]] = await pool.query<
        (RowDataPacket & { quantity: string; count: number })[]
      >(
        "SELECT SUM(quantity) quantity,COUNT(*) count FROM inventory_transaction WHERE reference_type='return_detail' AND reference_detail_id=?",
        [confirmedReturn.details[0]!.id],
      );
      expect(Number(returnLedger?.quantity)).toBe(3);
      expect(Number(returnLedger?.count)).toBe(1);

      const pendingCheck = await repository.createStockCheck(
        {
          details: [{ itemBatchId: String(fixture.itemBatchId), stockStatus: 'available' }],
        },
        context(actorId, `${fixture.token}-check-create`),
      );
      expect(Number(pendingCheck.details[0]?.systemQuantity)).toBe(8);
      const counted = await repository.saveStockCheckCounts(
        pendingCheck.id,
        {
          version: pendingCheck.version,
          details: [{ detailId: pendingCheck.details[0]!.id, actualQuantity: 7 }],
        },
        context(actorId, `${fixture.token}-check-count`),
      );
      expect(counted.status).toBe('counting');
      expect(counted.details[0]?.result).toBe('shortage');

      const completed = await repository.completeStockCheck(
        counted.id,
        counted.version,
        context(actorId, `${fixture.token}-check-complete`),
      );
      expect(completed.status).toBe('completed');
      expect(completed.details[0]?.adjusted).toBe(true);
      const [[balance]] = await pool.query<(RowDataPacket & { quantity: string })[]>(
        "SELECT SUM(quantity) quantity FROM inventory_transaction WHERE batch_id=? AND stock_status='available'",
        [fixture.itemBatchId],
      );
      expect(Number(balance?.quantity)).toBe(7);
      const [[audit]] = await pool.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) count FROM operation_logs
         WHERE request_id LIKE ? AND action IN ('production-return.confirm','production-stock-check.complete')`,
        [`${fixture.token}-%`],
      );
      expect(Number(audit?.count)).toBe(2);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('invalidates a short-batch authorization and restores its demand gap on pre-start return', async () => {
    const fixture = await createFixture(pool, actorId);
    try {
      await pool.execute(
        `UPDATE production_batches
         SET status='material_partially_outbound',material_plan_version=3
         WHERE id=?`,
        [fixture.productionBatchId],
      );
      await pool.execute(
        `UPDATE production_item_demand
         SET remaining_number=5,business_status='active'
         WHERE id=?`,
        [fixture.demandId],
      );
      const authorizationId = await insert(
        pool,
        `INSERT INTO production_short_batch_authorization
         (production_batch_id,material_plan_version,status,reason,authorized_by)
         VALUES (?,3,'active','退料前授权',?)`,
        [fixture.productionBatchId, actorId],
      );
      const pendingReturn = await repository.createReturnOrder(
        {
          productionBatchId: String(fixture.productionBatchId),
          details: [{ allocationId: String(fixture.allocationId), returnQuantity: 5 }],
        },
        context(actorId, `${fixture.token}-short-return-create`),
      );

      await repository.confirmReturnOrder(
        pendingReturn.id,
        pendingReturn.version,
        context(actorId, `${fixture.token}-short-return-confirm`),
      );

      const [[batch]] = await pool.query<
        (RowDataPacket & { material_plan_version: number; version: number })[]
      >('SELECT material_plan_version,version FROM production_batches WHERE id=?', [
        fixture.productionBatchId,
      ]);
      expect(batch?.material_plan_version).toBe(4);
      const [[authorization]] = await pool.query<(RowDataPacket & { status: string })[]>(
        'SELECT status FROM production_short_batch_authorization WHERE id=?',
        [authorizationId],
      );
      expect(authorization?.status).toBe('superseded');
      const [[demand]] = await pool.query<
        (RowDataPacket & { remaining_number: string; business_status: string })[]
      >('SELECT remaining_number,business_status FROM production_item_demand WHERE id=?', [
        fixture.demandId,
      ]);
      expect(Number(demand?.remaining_number)).toBe(10);
      expect(demand?.business_status).toBe('active');
      expect(
        await getNetConfirmedMaterialOutboundQuantity(pool, String(fixture.productionBatchId)),
      ).toBe(0);
    } finally {
      await cleanup(pool, fixture);
    }
  });

  it('creates and confirms a material loss for a partially outbound batch and advances its plan', async () => {
    const fixture = await createFixture(pool, actorId);
    try {
      await pool.execute(
        "UPDATE production_batches SET status='material_partially_outbound' WHERE id=?",
        [fixture.productionBatchId],
      );
      const options = await repository.listMaterialLossBatchOptions();
      expect(options).toContainEqual(
        expect.objectContaining({
          productionBatchId: String(fixture.productionBatchId),
          batchStatus: 'material_partially_outbound',
        }),
      );
      const [[beforeBatch]] = await pool.query<
        (RowDataPacket & { material_plan_version: number; version: number })[]
      >('SELECT material_plan_version,version FROM production_batches WHERE id=?', [
        fixture.productionBatchId,
      ]);
      const created = await repository.createMaterialLoss(
        {
          productionBatchId: String(fixture.productionBatchId),
          allocationId: String(fixture.allocationId),
          scrapQuantity: 2,
          reasonType: '现场损耗',
          remark: '确认后等量补料',
        },
        context(actorId, `${fixture.token}-loss-create`),
      );
      expect(created).toMatchObject({ status: 'pending', scrapQuantity: '2.0000' });

      const confirmed = await repository.confirmMaterialLoss(
        created.id,
        created.version,
        context(actorId, `${fixture.token}-loss-confirm`),
      );
      expect(confirmed).toMatchObject({
        status: 'confirmed',
        version: 1,
        supplement: {
          status: 'approved',
          demandQuantity: '2.0000',
        },
      });
      const [[demand]] = await pool.query<
        (RowDataPacket & {
          demand_type: string;
          need_number: string;
          supplement_id: number;
          generation_group_key: string;
        })[]
      >(
        'SELECT demand_type,need_number,supplement_id,generation_group_key FROM production_item_demand WHERE id=?',
        [confirmed.supplement!.demandId],
      );
      expect(demand).toMatchObject({
        demand_type: 'material_loss_supplement',
        need_number: '2.0000',
      });
      expect(demand?.generation_group_key).toBe(`LOSSSUP:${demand.supplement_id}`);
      const [[batch]] = await pool.query<
        (RowDataPacket & { material_plan_version: number; version: number })[]
      >('SELECT material_plan_version,version FROM production_batches WHERE id=?', [
        fixture.productionBatchId,
      ]);
      expect(batch).toMatchObject({
        material_plan_version: beforeBatch!.material_plan_version + 1,
        version: beforeBatch!.version + 1,
      });
    } finally {
      await cleanup(pool, fixture);
    }
  });
});

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

async function createFixture(pool: Pool, actorId: number): Promise<Fixture> {
  const token = `return-stock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const productCategoryId = await insert(
    pool,
    "INSERT INTO product_categories(category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-pc`, '成品'],
  );
  const materialCategoryId = await insert(
    pool,
    "INSERT INTO product_categories(category_code,category_name,item_kind) VALUES (?,?,'material')",
    [`${token}-mc`, '原料'],
  );
  const productId = await insert(
    pool,
    "INSERT INTO products(item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'pcs','self_made')",
    [`${token}-p`, '成品', productCategoryId],
  );
  const materialId = await insert(
    pool,
    "INSERT INTO products(item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'kg','purchased')",
    [`${token}-m`, '原料', materialCategoryId],
  );
  const materialVariantId = await insert(
    pool,
    "INSERT INTO material_variants(material_product_id,major_version,minor_version,variant_code,created_by,updated_by) VALUES (?, 'v1','A',?,?,?)",
    [materialId, `${token}-m-v1-A`, actorId, actorId],
  );
  const productMaterialId = await insert(
    pool,
    "INSERT INTO product_materials(product_id,material_product_id,quantity_per_unit,unit,is_key_material,need_batch_record) VALUES (?,?,'1.0000','kg',1,1)",
    [productId, materialId],
  );
  const workOrderId = await insert(
    pool,
    "INSERT INTO work_orders(work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,'10.0000','released')",
    [`${token}-wo`, productId, `${token}-p`, '成品', 'pcs'],
  );
  const productionBatchId = await insert(
    pool,
    "INSERT INTO production_batches(work_order_id,product_id,batch_no,planned_quantity,status) VALUES (?,?,?,'10.0000','material_outbound')",
    [workOrderId, productId, `${token}-batch`],
  );
  const requirementBasisId = await insert(
    pool,
    `INSERT INTO production_material_requirement_basis
      (production_batch_id,product_material_id,material_product_id,material_code_snapshot,material_name_snapshot,
       unit_snapshot,quantity_per_unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,
       planned_output_quantity_snapshot,required_number,created_by)
     VALUES (?,?,?,?,'原料','kg','1.0000',1,1,'10.0000','10.0000',?)`,
    [productionBatchId, productMaterialId, materialId, `${token}-m`, actorId],
  );
  const demandId = await insert(
    pool,
    "INSERT INTO production_item_demand(production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,item_code_snapshot,item_name_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,idempotency_key,business_status,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,'1.0000','kg',1,1,'10.0000','10.0000',10,'normal',?,?,'active',?,?)",
    [
      productionBatchId,
      requirementBasisId,
      productMaterialId,
      materialId,
      materialVariantId,
      token + '-m',
      '原料',
      `${token}-m-v1-A`,
      `NORMAL:${productionBatchId}`,
      `NORMAL:${productionBatchId}:${productMaterialId}`,
      actorId,
      actorId,
    ],
  );
  const itemBatchId = await insert(
    pool,
    "INSERT INTO item_batch(item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,product_name_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,? ,?,'kg',?,'purchased',?,?)",
    [
      materialId,
      materialVariantId,
      `${token}-m`,
      `${token}-m-v1-A`,
      '原料',
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

async function cleanup(pool: Pool, fixture: Fixture) {
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
  await pool.execute(
    `DELETE FROM production_short_batch_authorization_detail
     WHERE authorization_id IN (
       SELECT id FROM production_short_batch_authorization WHERE production_batch_id=?
     )`,
    [fixture.productionBatchId],
  );
  await pool.execute(
    'DELETE FROM production_short_batch_authorization WHERE production_batch_id=?',
    [fixture.productionBatchId],
  );
  await pool.execute('DELETE FROM outbound_detail WHERE outbound_id=?', [fixture.outboundOrderId]);
  await pool.execute('DELETE FROM outbound_order WHERE id=?', [fixture.outboundOrderId]);
  await pool.execute(
    "DELETE FROM production_item_demand WHERE production_batch_id=? AND demand_type='material_loss_supplement'",
    [fixture.productionBatchId],
  );
  await pool.execute(
    "DELETE FROM production_material_supplement WHERE production_batch_id=? AND source_type='material_loss'",
    [fixture.productionBatchId],
  );
  await pool.execute('DELETE FROM item_scrap WHERE production_batch_id=?', [
    fixture.productionBatchId,
  ]);
  await pool.execute('DELETE FROM production_item_allocation WHERE id=?', [fixture.allocationId]);
  await pool.execute('DELETE FROM production_item_demand WHERE id=?', [fixture.demandId]);
  await pool.execute('DELETE FROM item_batch WHERE id=?', [fixture.itemBatchId]);
  await pool.execute('DELETE FROM production_material_requirement_basis WHERE id=?', [
    fixture.requirementBasisId,
  ]);
  await pool.execute('DELETE FROM production_batches WHERE id=?', [fixture.productionBatchId]);
  await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
  await pool.execute('DELETE FROM product_materials WHERE id=?', [fixture.productMaterialId]);
  await pool.execute('DELETE FROM material_variants WHERE material_product_id=?', [
    fixture.materialId,
  ]);
  await pool.execute('DELETE FROM products WHERE id IN (?,?)', [
    fixture.productId,
    fixture.materialId,
  ]);
  await pool.execute('DELETE FROM product_categories WHERE id IN (?,?)', [
    fixture.productCategoryId,
    fixture.materialCategoryId,
  ]);
}

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

async function insert(pool: Pool, sql: string, values: unknown[]) {
  const [result] = await pool.execute<ResultSetHeader>(sql, values as never);
  return Number(result.insertId);
}
const context = (actorId: number, requestId: string) => ({
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
