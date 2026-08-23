import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createConnection,
  type Connection,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { readdir, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

const MIGRATIONS_DIR = new URL('../../../packages/database/migrations/', import.meta.url);
const SCRAP_REPLENISHMENT_PREFIXES = ['202608200001', '202608200002', '202608200003'];

type ConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
};

/**
 * 生产报废补料方案链路的 MySQL 迁移验证：
 *  - fresh：空库全量 up 到最新 schema；
 *  - 配对：三条新 migration 的 down 可逆执行并再次 up（在空库上 guard 必须放行）；
 *  - upgrade：已有旧 schema 与旧数据时，三条新 up 幂等搬迁数据、不丢数据不失败。
 * 临时数据库一律使用 `*_test` 命名并在用例结束/套件结束时删除，绝不触碰其他库。
 */
describeMysql('Production scrap supplement migrations', () => {
  let admin: Connection;
  let options: ConnectionOptions;
  const tempDatabases = new Set<string>();

  beforeAll(async () => {
    const database = required('DB_NAME');
    if (!/(?:_test|_ci)$/.test(database)) {
      throw new Error('migration integration tests require a dedicated *_test or *_ci database');
    }
    // CI 用最小权限应用账号跑套件，建/删临时库需要 root 管理账号（TEST_DB_ADMIN_*）；
    // 本地开发库直接用 DB_USER/DB_PASSWORD 作为回退。
    const adminUser = process.env.TEST_DB_ADMIN_USER ?? required('DB_USER');
    const adminPassword = process.env.TEST_DB_ADMIN_PASSWORD ?? required('DB_PASSWORD');
    options = {
      host: required('DB_HOST'),
      port: Number(required('DB_PORT')),
      user: adminUser,
      password: adminPassword,
    };
    admin = await createConnection({ ...options, multipleStatements: false });
  });

  afterAll(async () => {
    for (const name of tempDatabases) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } catch {
        // best-effort cleanup; a leftover *_test database is safer than a failed teardown
      }
    }
    await admin?.end();
  });

  it('applies the full up chain on a fresh database, pairs every new down, and re-applies up', async () => {
    const tempDb = `ssp_mig_fresh_${Date.now()}_test`;
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrations());
      await expectNewSchema(connection);

      // 配对验证：逆序执行三条 down（空库 guard 必须放行），schema 回到旧形状。
      await applyMigrations(connection, [
        `${SCRAP_REPLENISHMENT_PREFIXES[2]}-production-scrap-supplement-plan.down.sql`,
        `${SCRAP_REPLENISHMENT_PREFIXES[1]}-production-material-loss-supplement.down.sql`,
        `${SCRAP_REPLENISHMENT_PREFIXES[0]}-production-scrap-reproduction-authorization.down.sql`,
      ]);
      await expectOldSchema(connection);

      // 再次 up：验证 down/up 配对闭环后可重新升级到新形状。
      await applyMigrations(connection, await upMigrationsFor(SCRAP_REPLENISHMENT_PREFIXES));
      await expectNewSchema(connection);
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  it('upgrades an existing old-schema database with legacy data without losing anything', async () => {
    const tempDb = `ssp_mig_upgrade_${Date.now()}_test`;
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrationsBefore(SCRAP_REPLENISHMENT_PREFIXES[0]!));
      const legacy = await insertLegacyFixture(connection);
      await expectLegacyShape(connection, legacy);

      await applyMigrations(connection, await upMigrationsFrom(SCRAP_REPLENISHMENT_PREFIXES[0]!));
      await expectNewSchema(connection);
      await expectLegacyDataMigrated(connection, legacy);
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  const createTempDatabase = async (name: string): Promise<Connection> => {
    await admin.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    tempDatabases.add(name);
    return createConnection({ ...options, database: name, multipleStatements: true });
  };

  const dropTempDatabase = async (name: string): Promise<void> => {
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    tempDatabases.delete(name);
  };
});

const applyMigrations = async (connection: Connection, names: string[]): Promise<void> => {
  for (const name of names) {
    const sql = await readFile(new URL(name, MIGRATIONS_DIR), 'utf8');
    await connection.query(sql);
  }
};

const upMigrations = async (): Promise<string[]> => {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.up.sql')).sort();
  return names;
};

const upMigrationsFor = async (prefixes: string[]): Promise<string[]> => {
  const names = await upMigrations();
  return names.filter((name) => prefixes.includes(name.slice(0, 12)));
};

const upMigrationsBefore = async (prefix: string): Promise<string[]> => {
  const names = await upMigrations();
  return names.filter((name) => name.slice(0, 12) < prefix);
};

const upMigrationsFrom = async (prefix: string): Promise<string[]> => {
  const names = await upMigrations();
  return names.filter((name) => name.slice(0, 12) >= prefix);
};

const tableExists = async (connection: Connection, table: string): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?`,
    [table],
  );
  return Number(row?.count ?? 0) === 1;
};

const columnExists = async (
  connection: Connection,
  table: string,
  column: string,
): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
    [table, column],
  );
  return Number(row?.count ?? 0) === 1;
};

const expectNewSchema = async (connection: Connection): Promise<void> => {
  for (const table of [
    'batch_step_scrap_reproduction_authorization',
    'production_scrap_supplement_plan',
    'production_scrap_supplement_plan_line',
    'item_scrap',
  ]) {
    expect(await tableExists(connection, table)).toBe(true);
  }
  expect(await tableExists(connection, 'production_material_supplement_detail')).toBe(false);
  expect(await columnExists(connection, 'production_item_demand', 'supplement_id')).toBe(true);
  expect(
    await columnExists(connection, 'production_item_demand', 'source_supplement_detail_id'),
  ).toBe(false);
  expect(await columnExists(connection, 'production_item_demand', 'source_scrap_id')).toBe(false);
  expect(await columnExists(connection, 'batch_step_reports', 'abnormal_origin')).toBe(true);
  expect(await columnExists(connection, 'production_material_supplement', 'source_type')).toBe(
    true,
  );
  expect(
    await columnExists(connection, 'production_material_supplement', 'material_loss_scrap_id'),
  ).toBe(true);
  expect(await columnExists(connection, 'production_material_supplement', 'version')).toBe(true);
  expect(await columnExists(connection, 'production_material_supplement', 'fulfilled_at')).toBe(
    true,
  );
  expect(await columnExists(connection, 'production_material_supplement', 'activated_at')).toBe(
    false,
  );
};

const expectOldSchema = async (connection: Connection): Promise<void> => {
  for (const table of [
    'batch_step_scrap_reproduction_authorization',
    'production_scrap_supplement_plan',
    'production_scrap_supplement_plan_line',
    'item_scrap',
  ]) {
    expect(await tableExists(connection, table)).toBe(false);
  }
  expect(await tableExists(connection, 'production_material_supplement_detail')).toBe(true);
  expect(await columnExists(connection, 'production_item_demand', 'supplement_id')).toBe(false);
  expect(
    await columnExists(connection, 'production_item_demand', 'source_supplement_detail_id'),
  ).toBe(true);
  expect(await columnExists(connection, 'production_item_demand', 'source_scrap_id')).toBe(true);
  expect(await columnExists(connection, 'batch_step_reports', 'abnormal_origin')).toBe(false);
  expect(await columnExists(connection, 'production_material_supplement', 'source_type')).toBe(
    false,
  );
  expect(await columnExists(connection, 'production_material_supplement', 'version')).toBe(false);
  expect(await columnExists(connection, 'production_material_supplement', 'fulfilled_at')).toBe(
    false,
  );
  expect(await columnExists(connection, 'production_material_supplement', 'activated_at')).toBe(
    true,
  );
};

type LegacyFixture = {
  token: string;
  actorId: number;
  productId: number;
  materialId: number;
  productMaterialId: number;
  routeId: number;
  batchId: number;
  stepRecordId: number;
  reportId: number;
  dispositionId: number;
  scrapRecordId: number;
  supplementId: number;
  detailId: number;
  normalDemandId: number;
  scrapDemandId: number;
};

/**
 * 构造 202608200001 之前的旧 schema 数据：
 *  - 已批准报废的异常处置单（reviewed_by/reviewed_at 非空，迁移回填授权时依赖）；
 *  - 已激活的补料单（旧模型 activated 状态，迁移后应为 fulfilled）；
 *  - scrap_supplement 正式需求经 source_supplement_detail_id 挂明细（迁移后回填 supplement_id）。
 */
const insertLegacyFixture = async (connection: Connection): Promise<LegacyFixture> => {
  const token = `ssp-legacy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const actorId = await insert(
    connection,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-actor`, 'not-used-by-test', 'Migration actor'],
  );
  const categoryId = await insert(
    connection,
    "INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-category`, 'Migration category'],
  );
  const productId = await insert(
    connection,
    "INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'pcs','self_made')",
    [`${token}-product`, 'Migration product', categoryId],
  );
  const materialCategoryId = await insert(
    connection,
    "INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,'material')",
    [`${token}-mc`, 'Migration material category'],
  );
  const materialId = await insert(
    connection,
    "INSERT INTO products (item_code,product_name,category_id,unit,acquire_method) VALUES (?,?,?,'kg','purchased')",
    [`${token}-m`, 'Migration material', materialCategoryId],
  );
  const productMaterialId = await insert(
    connection,
    "INSERT INTO product_materials (product_id,material_product_id,quantity_per_unit,unit,is_key_material,need_batch_record) VALUES (?,?,'1.0000','kg',1,1)",
    [productId, materialId],
  );
  const processStepId = await insert(
    connection,
    'INSERT INTO process_steps (step_code,step_name,status) VALUES (?,?,1)',
    [`${token}-step`, 'Migration step'],
  );
  const routeId = await insert(
    connection,
    "INSERT INTO process_routes (product_id,route_code,route_name,version_no,status) VALUES (?,?,?,'V1','enabled')",
    [productId, `${token}-route`, 'Migration route'],
  );
  const routeStepId = await insert(
    connection,
    'INSERT INTO process_route_steps (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,need_record,need_inspection) VALUES (?,?,?,?,?,1,0)',
    [routeId, processStepId, 1, `${token}-step`, 'Migration step'],
  );
  const workOrderId = await insert(
    connection,
    "INSERT INTO work_orders (work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,status) VALUES (?,?,?,?,?,'10.0000','released')",
    [`${token}-wo`, productId, `${token}-product`, 'Migration product', 'pcs'],
  );
  const batchId = await insert(
    connection,
    "INSERT INTO production_batches (work_order_id,product_id,batch_no,route_id,planned_quantity,status) VALUES (?,?,?,?,'10.0000','doing')",
    [workOrderId, productId, `${token}-batch`, routeId],
  );
  const stepRecordId = await insert(
    connection,
    'INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,need_record_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,1,0,?,?,?)',
    [batchId, routeStepId, 1, `${token}-step`, 'Migration step', 'pcs', actorId, actorId],
  );
  const normalDemandId = await insert(
    connection,
    "INSERT INTO production_item_demand (production_batch_id,product_material_id,item_id,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,demand_type,idempotency_key,business_status,created_by,updated_by) VALUES (?,?,?,'1.0000','kg',1,1,'10.0000','10.0000','normal',?,'active',?,?)",
    [
      batchId,
      productMaterialId,
      materialId,
      `NORMAL:${batchId}:${productMaterialId}`,
      actorId,
      actorId,
    ],
  );
  const reportId = await insert(
    connection,
    "INSERT INTO batch_step_reports (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,remark,created_by) VALUES (?,?,?,'normal','10.0000','8.0000','2.0000','pcs',?,?)",
    [`${token}-report`, batchId, stepRecordId, 'scrap source', actorId],
  );
  const dispositionId = await insert(
    connection,
    "INSERT INTO batch_step_abnormal_dispositions (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,review_status,disposition_type,reviewed_by,reviewed_at,remark,version,created_by,updated_by) VALUES (?,?,?,?,'approved','scrap',?,NOW(),?,0,?,?)",
    [`${token}-disp`, batchId, stepRecordId, reportId, actorId, 'scrap source', actorId, actorId],
  );
  const scrapRecordId = await insert(
    connection,
    "INSERT INTO batch_step_scrap_records (abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id,scrap_quantity,unit_snapshot,created_by) VALUES (?,?,?,?,'2.0000','pcs',?)",
    [dispositionId, batchId, stepRecordId, reportId, actorId],
  );
  const supplementId = await insert(
    connection,
    "INSERT INTO production_material_supplement (supplement_no,scrap_record_id,production_batch_id,batch_step_record_id,status,activated_at,activated_by,remark,created_by) VALUES (?,?,?,?,'activated',NOW(),?,?,?)",
    [`${token}-sup`, scrapRecordId, batchId, stepRecordId, actorId, 'scrap source', actorId],
  );
  const detailId = await insert(
    connection,
    "INSERT INTO production_material_supplement_detail (supplement_id,production_batch_id,product_material_id,item_id,original_demand_id,supplement_quantity,unit_snapshot,created_by) VALUES (?,?,?,?,?,'2.0000','kg',?)",
    [supplementId, batchId, productMaterialId, materialId, normalDemandId, actorId],
  );
  const scrapDemandId = await insert(
    connection,
    "INSERT INTO production_item_demand (production_batch_id,product_material_id,item_id,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,demand_type,idempotency_key,parent_demand_id,source_supplement_detail_id,reason_type,remark,business_status,created_by,updated_by) VALUES (?,?,?,'1.0000','kg',1,1,'10.0000','2.0000','scrap_supplement',?,?,?,'step_scrap',?, 'active',?,?)",
    [
      batchId,
      productMaterialId,
      materialId,
      `SCRAPSUP:${supplementId}:${normalDemandId}`,
      normalDemandId,
      detailId,
      'scrap source',
      actorId,
      actorId,
    ],
  );
  return {
    token,
    actorId,
    productId,
    materialId,
    productMaterialId,
    routeId,
    batchId,
    stepRecordId,
    reportId,
    dispositionId,
    scrapRecordId,
    supplementId,
    detailId,
    normalDemandId,
    scrapDemandId,
  };
};

const expectLegacyShape = async (connection: Connection, fixture: LegacyFixture): Promise<void> => {
  expect(await tableExists(connection, 'production_material_supplement_detail')).toBe(true);
  const [[scrapDemand]] = await connection.query<
    (RowDataPacket & { source_supplement_detail_id: number })[]
  >('SELECT source_supplement_detail_id FROM production_item_demand WHERE id=?', [
    fixture.scrapDemandId,
  ]);
  expect(scrapDemand?.source_supplement_detail_id).toBe(fixture.detailId);
  expect(await tableExists(connection, 'batch_step_scrap_reproduction_authorization')).toBe(false);
  expect(await columnExists(connection, 'batch_step_reports', 'abnormal_origin')).toBe(false);
};

const expectLegacyDataMigrated = async (
  connection: Connection,
  fixture: LegacyFixture,
): Promise<void> => {
  // scrap_supplement 需求回填 supplement_id，need_number 原样保留。
  const [[scrapDemand]] = await connection.query<
    (RowDataPacket & {
      parent_demand_id: number;
      supplement_id: number;
      need_number: string;
      business_status: string;
    })[]
  >(
    "SELECT parent_demand_id,supplement_id,need_number,business_status FROM production_item_demand WHERE id=? AND demand_type='scrap_supplement'",
    [fixture.scrapDemandId],
  );
  expect(scrapDemand).toMatchObject({
    parent_demand_id: fixture.normalDemandId,
    supplement_id: fixture.supplementId,
    need_number: '2.0000',
    business_status: 'active',
  });
  expect(await tableExists(connection, 'production_material_supplement_detail')).toBe(false);

  // 补料单激活态迁移为 fulfilled，时间/人原样保留。
  const [[supplement]] = await connection.query<
    (RowDataPacket & { status: string; fulfilled_at: Date | null; fulfilled_by: number | null })[]
  >('SELECT status,fulfilled_at,fulfilled_by FROM production_material_supplement WHERE id=?', [
    fixture.supplementId,
  ]);
  expect(supplement).toMatchObject({
    status: 'fulfilled',
    fulfilled_by: fixture.actorId,
  });
  expect(supplement?.fulfilled_at).not.toBeNull();

  // 旧工序报废事实生成补产授权（授权量=报废量，截止工序=上报工序），不丢旧行。
  const [[authorization]] = await connection.query<
    (RowDataPacket & {
      scrap_record_id: number;
      supplement_id: number;
      entry_step_record_id: number;
      quota_end_step_record_id: number;
      material_end_step_record_id: number;
      authorized_quantity: string;
      authorized_by: number;
    })[]
  >(
    'SELECT scrap_record_id,supplement_id,entry_step_record_id,quota_end_step_record_id,material_end_step_record_id,authorized_quantity,authorized_by FROM batch_step_scrap_reproduction_authorization WHERE scrap_record_id=?',
    [fixture.scrapRecordId],
  );
  expect(authorization).toMatchObject({
    scrap_record_id: fixture.scrapRecordId,
    supplement_id: fixture.supplementId,
    entry_step_record_id: fixture.stepRecordId,
    quota_end_step_record_id: fixture.stepRecordId,
    material_end_step_record_id: fixture.stepRecordId,
    authorized_quantity: '2.0000',
    authorized_by: fixture.actorId,
  });

  // 报工事实回填 abnormal_origin。
  const [[report]] = await connection.query<(RowDataPacket & { abnormal_origin: string | null })[]>(
    'SELECT abnormal_origin FROM batch_step_reports WHERE id=?',
    [fixture.reportId],
  );
  expect(report?.abnormal_origin).toBe('current_step');

  // 需求表约束与索引升级后，旧行总数不丢。
  const [[demandCount]] = await connection.query<(RowDataPacket & { count: number })[]>(
    "SELECT COUNT(*) count FROM production_item_demand WHERE production_batch_id=? AND demand_type='scrap_supplement'",
    [fixture.batchId],
  );
  expect(Number(demandCount?.count)).toBe(1);
};

const insert = async (connection: Connection, sql: string, values: unknown[]): Promise<number> => {
  const [result] = await connection.execute(sql, values as never);
  return Number((result as { insertId: number }).insertId);
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
