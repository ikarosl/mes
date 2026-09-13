import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createConnection,
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;
const MIGRATIONS_DIR = new URL('../../../packages/database/migrations/', import.meta.url);
const TARGET_MIGRATION = '202609110001-remove-bom-trace-flags';
const REPO_ROOT = new URL('../../../', import.meta.url);

type ConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
};

type BomFixture = {
  token: string;
  actorId: number;
  productId: number;
  materialId: number;
  variantId: number;
  productMaterialId: number;
  workOrderId: number;
  batchId: number;
  basisId: number;
  demandId: number;
};

type BomSnapshot = {
  productMaterial: RowDataPacket;
  basis: RowDataPacket;
  demand: RowDataPacket;
};

describeMysql('BOM trace flag migration', () => {
  let admin: Connection;
  let options: ConnectionOptions;
  const tempDatabases = new Set<string>();

  beforeAll(async () => {
    const referenceDatabase = required('TEST_DB_NAME');
    if (!/_test$/.test(referenceDatabase) || referenceDatabase === 'easy_mes') {
      throw new Error(
        'migration integration tests require a dedicated TEST_DB_NAME ending in _test',
      );
    }

    const host = required('TEST_DB_HOST');
    const port = Number(required('TEST_DB_PORT'));
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('TEST_DB_PORT must be a positive integer');
    }
    options = {
      host,
      port,
      user: process.env.TEST_DB_ADMIN_USER ?? process.env.TEST_DB_USER ?? required('DB_USER'),
      password:
        process.env.TEST_DB_ADMIN_PASSWORD ??
        process.env.TEST_DB_PASSWORD ??
        required('DB_PASSWORD'),
    };
    // The reference TEST_DB is used only as an environment safety marker. Every
    // statement below runs against a newly-created temporary *_test database.
    admin = await createConnection({ ...options, multipleStatements: false });
  });

  afterAll(async () => {
    for (const name of tempDatabases) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } catch {
        // Best-effort cleanup. A leftover *_test database is safer than a failed teardown.
      }
    }
    await admin?.end();
  });

  it('applies the full latest up chain and performs target down/up with all six columns', async () => {
    const tempDb = temporaryDatabaseName('bom_flags_shape');
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrations());
      await expectBomFlagSchema(connection, false);

      await runMigration(connection, `${TARGET_MIGRATION}.down.sql`);
      await expectBomFlagSchema(connection, true);

      await runMigration(connection, `${TARGET_MIGRATION}.up.sql`);
      await expectBomFlagSchema(connection, false);
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  it('rejects down before any DDL when BOM, basis, and demand data exist', async () => {
    const tempDb = temporaryDatabaseName('bom_flags_guard');
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrations());
      const fixture = await insertBomFixture(connection, false);
      const [[counts]] = await connection.query<
        (RowDataPacket & {
          product_materials: number;
          requirement_basis: number;
          item_demand: number;
        })[]
      >(
        `SELECT
           (SELECT COUNT(*) FROM product_materials) product_materials,
           (SELECT COUNT(*) FROM production_material_requirement_basis) requirement_basis,
           (SELECT COUNT(*) FROM production_item_demand) item_demand`,
      );
      expect(counts).toMatchObject({ product_materials: 1, requirement_basis: 1, item_demand: 1 });
      expect(fixture.demandId).toBeGreaterThan(0);

      await expect(runMigration(connection, `${TARGET_MIGRATION}.down.sql`)).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
      await dropRollbackGuard(connection);

      // The guard is the first statement that can fail. If a preceding ALTER had
      // run, one or more of these columns/checks would already have changed.
      await expectBomFlagSchema(connection, false);
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  it('upgrades populated BOM rows without changing non-flag fields', async () => {
    const tempDb = temporaryDatabaseName('bom_flags_upgrade');
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrations());
      await runMigration(connection, `${TARGET_MIGRATION}.down.sql`);
      const fixture = await insertBomFixture(connection, true);
      const before = await snapshotBomFixture(connection, fixture);

      await runMigration(connection, `${TARGET_MIGRATION}.up.sql`);
      await expectBomFlagSchema(connection, false);
      const after = await snapshotBomFixture(connection, fixture);

      expect(after).toEqual(before);
    } finally {
      await connection.end();
      await dropTempDatabase(tempDb);
    }
  });

  it('keeps demo seed loading idempotent and refuses rollback after demo BOM data', async () => {
    const tempDb = temporaryDatabaseName('bom_flags_demo');
    const connection = await createTempDatabase(tempDb);
    try {
      await applyMigrations(connection, await upMigrations());
      await runDemoSeed(tempDb);
      const before = await demoProjection(connection);
      expect(before.bom.length).toBeGreaterThan(0);

      await runDemoSeed(tempDb);
      const after = await demoProjection(connection);
      expect(after).toEqual(before);

      await expect(runMigration(connection, `${TARGET_MIGRATION}.down.sql`)).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
      await dropRollbackGuard(connection);
      await expectBomFlagSchema(connection, false);
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

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable: ${name}`);
  return value;
};

const temporaryDatabaseName = (prefix: string): string =>
  `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}_test`;

const applyMigrations = async (connection: Connection, names: string[]): Promise<void> => {
  for (const name of names) {
    try {
      await runMigration(connection, name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${name} failed: ${message}`, { cause: error });
    }
  }
};

const runMigration = async (connection: Connection, name: string): Promise<void> => {
  const sql = await readFile(new URL(name, MIGRATIONS_DIR), 'utf8');
  await connection.query(sql);
};

const upMigrations = async (): Promise<string[]> =>
  (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.up.sql')).sort();

const columnExists = async (
  connection: Connection,
  table: string,
  column: string,
): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count
       FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
    [table, column],
  );
  return Number(row?.count ?? 0) === 1;
};

const checkClause = async (connection: Connection, constraint: string): Promise<string> => {
  const [[row]] = await connection.query<(RowDataPacket & { clause: string })[]>(
    `SELECT check_clause clause
       FROM information_schema.check_constraints
      WHERE constraint_schema=DATABASE() AND constraint_name=?`,
    [constraint],
  );
  if (!row) throw new Error(`missing check constraint ${constraint}`);
  return row.clause;
};

const expectBomFlagSchema = async (connection: Connection, legacy: boolean): Promise<void> => {
  for (const [table, column] of [
    ['product_materials', 'is_key_material'],
    ['product_materials', 'need_batch_record'],
    ['production_material_requirement_basis', 'is_key_material_snapshot'],
    ['production_material_requirement_basis', 'need_batch_record_snapshot'],
    ['production_item_demand', 'is_key_material_snapshot'],
    ['production_item_demand', 'need_batch_record_snapshot'],
  ] as const) {
    expect(await columnExists(connection, table, column)).toBe(legacy);
  }

  expect(await columnExists(connection, 'product_materials', 'status')).toBe(true);
  expect(await columnExists(connection, 'product_materials', 'is_deleted')).toBe(true);
  const productFlags = (await checkClause(connection, 'chk_product_materials_flags')).toLowerCase();
  expect(productFlags).toContain('status');
  expect(productFlags).toContain('is_deleted');
  expect(productFlags.includes('is_key_material')).toBe(legacy);
  expect(productFlags.includes('need_batch_record')).toBe(legacy);

  expect(await checkExists(connection, 'chk_material_requirement_basis_flags')).toBe(legacy);
  expect(await checkExists(connection, 'chk_production_item_demand_flags')).toBe(legacy);
};

const checkExists = async (connection: Connection, constraint: string): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count
       FROM information_schema.check_constraints
      WHERE constraint_schema=DATABASE() AND constraint_name=?`,
    [constraint],
  );
  return Number(row?.count ?? 0) === 1;
};

const insert = async (
  connection: Connection,
  sql: string,
  values: (string | number | null)[],
): Promise<number> => {
  const [result] = await connection.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const insertBomFixture = async (
  connection: Connection,
  legacyFlags: boolean,
): Promise<BomFixture> => {
  const token = `bom-flags-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const actorId = await insert(
    connection,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-actor`, 'migration-test-only', 'BOM migration actor'],
  );
  const finishedCategoryId = await insert(
    connection,
    "INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,'finished_product')",
    [`${token}-finished-category`, 'BOM migration finished category'],
  );
  const materialCategoryId = await insert(
    connection,
    "INSERT INTO product_categories (category_code,category_name,item_kind) VALUES (?,?,'material')",
    [`${token}-material-category`, 'BOM migration material category'],
  );
  const productId = await insert(
    connection,
    `INSERT INTO products
       (item_code,product_name,category_id,unit,acquire_method,created_by,updated_by)
     VALUES (?,? ,?,'pcs','self_made',?,?)`,
    [`${token}-product`, 'BOM migration product', finishedCategoryId, actorId, actorId],
  );
  const materialId = await insert(
    connection,
    `INSERT INTO materials
       (material_code,material_name,category_id,unit,acquire_method,created_by,updated_by)
     VALUES (?,? ,?,'kg','purchased',?,?)`,
    [`${token}-material`, 'BOM migration material', materialCategoryId, actorId, actorId],
  );
  const variantId = await insert(
    connection,
    `INSERT INTO material_variants
       (material_id,major_version,minor_version,variant_code,created_by,updated_by)
     VALUES (?,'v1','A',?,?,?)`,
    [materialId, `${token}-material-v1-A`, actorId, actorId],
  );
  const productMaterialSql = legacyFlags
    ? `INSERT INTO product_materials
         (product_id,material_id,quantity_per_unit,unit,is_key_material,need_batch_record,status,remark,created_by,updated_by)
       VALUES (?,?,'2.0000','kg',0,1,1,?, ?,?)`
    : `INSERT INTO product_materials
         (product_id,material_id,quantity_per_unit,unit,status,remark,created_by,updated_by)
       VALUES (?,?,'2.0000','kg',1,?, ?,?)`;
  const productMaterialId = await insert(
    connection,
    productMaterialSql,
    legacyFlags
      ? [productId, materialId, `${token} product BOM`, actorId, actorId]
      : [productId, materialId, `${token} product BOM`, actorId, actorId],
  );
  const workOrderId = await insert(
    connection,
    `INSERT INTO work_orders
       (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,
        planned_quantity,status,created_by,updated_by)
     VALUES (?,'research',?,?,?,'pcs','10.0000','draft',?,?)`,
    [
      `${token}-work-order`,
      productId,
      `${token}-product`,
      'BOM migration product',
      actorId,
      actorId,
    ],
  );
  const batchId = await insert(
    connection,
    `INSERT INTO production_batches
       (work_order_id,product_id,batch_no,planned_quantity,status,created_by,updated_by)
     VALUES (?,?,?,'10.0000','pending',?,?)`,
    [workOrderId, productId, `${token}-batch`, actorId, actorId],
  );
  const basisSql = legacyFlags
    ? `INSERT INTO production_material_requirement_basis
         (production_batch_id,product_material_id,material_id,material_code_snapshot,unit_snapshot,
          quantity_per_unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,
          planned_output_quantity_snapshot,required_number,created_by)
       VALUES (?,?,?,?,'kg','2.0000',0,1,'10.0000','20.0000',?)`
    : `INSERT INTO production_material_requirement_basis
         (production_batch_id,product_material_id,material_id,material_code_snapshot,unit_snapshot,
          quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by)
       VALUES (?,?,?,?,'kg','2.0000','10.0000','20.0000',?)`;
  const basisId = await insert(connection, basisSql, [
    batchId,
    productMaterialId,
    materialId,
    `${token}-material`,
    actorId,
  ]);
  const demandSql = legacyFlags
    ? `INSERT INTO production_item_demand
         (production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,
          item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,
          is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,
          need_number,remaining_number,demand_type,generation_group_key,idempotency_key,business_status,
          version,created_by,updated_by)
       VALUES (?,?,?,?,?,?,?,'2.0000','kg',0,1,'10.0000','20.0000','20.0000','normal',?,?, 'active',0,?,?)`
    : `INSERT INTO production_item_demand
         (production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,
          item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,
          planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,
          idempotency_key,business_status,version,created_by,updated_by)
       VALUES (?,?,?,?,?,?,?,'2.0000','kg','10.0000','20.0000','20.0000','normal',?,?, 'active',0,?,?)`;
  const generationGroup = `NORMAL:${token}`;
  const demandId = await insert(connection, demandSql, [
    batchId,
    basisId,
    productMaterialId,
    materialId,
    variantId,
    `${token}-material`,
    `${token}-material-v1-A`,
    generationGroup,
    `${generationGroup}:1`,
    actorId,
    actorId,
  ]);
  return {
    token,
    actorId,
    productId,
    materialId,
    variantId,
    productMaterialId,
    workOrderId,
    batchId,
    basisId,
    demandId,
  };
};

const snapshotBomFixture = async (
  connection: Connection,
  fixture: BomFixture,
): Promise<BomSnapshot> => {
  const [[productMaterial]] = await connection.query<RowDataPacket[]>(
    `SELECT id,product_id,material_id,quantity_per_unit,unit,status,remark,is_deleted
       FROM product_materials WHERE id=?`,
    [fixture.productMaterialId],
  );
  const [[basis]] = await connection.query<RowDataPacket[]>(
    `SELECT id,production_batch_id,product_material_id,material_id,material_code_snapshot,unit_snapshot,
            quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by
       FROM production_material_requirement_basis WHERE id=?`,
    [fixture.basisId],
  );
  const [[demand]] = await connection.query<RowDataPacket[]>(
    `SELECT id,production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,
            item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,
            planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,
            idempotency_key,business_status,version,created_by,updated_by
       FROM production_item_demand WHERE id=?`,
    [fixture.demandId],
  );
  return { productMaterial: productMaterial!, basis: basis!, demand: demand! };
};

const runDemoSeed = async (database: string): Promise<void> => {
  const result = spawnSync(process.execPath, ['packages/database/dist/seed-demo.js'], {
    cwd: fileURLToPath(REPO_ROOT),
    encoding: 'utf8',
    env: {
      ...process.env,
      DB_HOST: required('TEST_DB_HOST'),
      DB_PORT: required('TEST_DB_PORT'),
      DB_USER: process.env.TEST_DB_ADMIN_USER ?? process.env.TEST_DB_USER ?? required('DB_USER'),
      DB_PASSWORD:
        process.env.TEST_DB_ADMIN_PASSWORD ??
        process.env.TEST_DB_PASSWORD ??
        required('DB_PASSWORD'),
      DB_NAME: database,
      ALLOW_DEMO_SEED: '1',
      DEMO_USER_PASSWORD: randomBytes(24).toString('hex'),
    },
  });
  if (result.status !== 0) {
    throw new Error(`demo seed failed (${result.status}): ${result.stdout}\n${result.stderr}`);
  }
};

const demoProjection = async (
  connection: Connection,
): Promise<{ products: RowDataPacket[]; bom: RowDataPacket[] }> => {
  const [products] = await connection.query<RowDataPacket[]>(
    `SELECT item_code,product_name,category_id,default_route_id,bom_status,version,status,is_deleted
       FROM products ORDER BY item_code`,
  );
  const [bom] = await connection.query<RowDataPacket[]>(
    `SELECT id,product_id,material_id,quantity_per_unit,unit,status,is_deleted
       FROM product_materials ORDER BY id`,
  );
  return { products, bom };
};

const dropRollbackGuard = async (connection: Connection): Promise<void> => {
  await connection.query('DROP TEMPORARY TABLE IF EXISTS tmp_bom_flags_rollback_guard');
};
