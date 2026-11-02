import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import type { Connection, RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  insertItemCategoryFixture,
  insertMaterialFixture,
  insertMaterialVariantFixture,
  insertProductFixture,
  insertUserFixture,
} from '../fixtures/master-data-fixture.js';
import {
  type MigrationSandbox,
  applyMigrations,
  baselineMigrations,
  createMigrationSandbox,
  insert,
  required,
  upMigrations,
} from '../fixtures/mysql-migration-fixture.js';
import { captureSchemaSnapshot } from '../fixtures/mysql-schema-snapshot.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;
const REPO_ROOT = new URL('../../../', import.meta.url);
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

describeMysql('Current BOM baseline (real MySQL)', () => {
  let sandbox: MigrationSandbox;
  beforeAll(async () => {
    sandbox = await createMigrationSandbox();
  });
  afterAll(async () => {
    await sandbox?.dispose();
  });

  it('omits retired BOM trace flags and preserves status/deletion checks and immutable task material facts', async () => {
    const { database, connection } = await sandbox.create('bom_current');
    try {
      await applyMigrations(connection, await upMigrations());
      const fixture = await insertBomFixture(connection);
      await expectCurrentBomSchema(connection);
      await expect(
        connection.execute('UPDATE product_materials SET status=2 WHERE id=?', [
          fixture.productMaterialId,
        ]),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await expect(
        connection.execute('UPDATE product_materials SET is_deleted=2 WHERE id=?', [
          fixture.productMaterialId,
        ]),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await expect(
        connection.execute(
          'UPDATE production_material_requirement_basis SET required_number=1 WHERE id=?',
          [fixture.basisId],
        ),
      ).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
      await expect(
        connection.execute('DELETE FROM production_material_requirement_basis WHERE id=?', [
          fixture.basisId,
        ]),
      ).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
      await expect(
        connection.execute('UPDATE production_item_demand SET need_number=1 WHERE id=?', [
          fixture.demandId,
        ]),
      ).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
      await expect(
        connection.execute('UPDATE production_item_demand SET generation_group_key=? WHERE id=?', [
          'NORMAL:wrong',
          fixture.demandId,
        ]),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await expect(
        connection.execute(
          "UPDATE production_item_demand SET business_status='fulfilled' WHERE id=?",
          [fixture.demandId],
        ),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await expect(
        connection.execute('UPDATE product_materials SET quantity_per_unit=100000000 WHERE id=?', [
          fixture.productMaterialId,
        ]),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      const before = await captureSchemaSnapshot(connection);
      for (const owner of ['product', 'production']) {
        for (const name of await baselineMigrations(owner, 'down')) {
          await expect(applyMigrations(connection, [name])).rejects.toMatchObject({
            cause: { code: 'ER_CHECK_CONSTRAINT_VIOLATED' },
          });
          expect(await captureSchemaSnapshot(connection)).toEqual(before);
        }
      }
      const [[basis]] = await connection.query<RowDataPacket[]>(
        'SELECT required_number FROM production_material_requirement_basis WHERE id=?',
        [fixture.basisId],
      );
      expect(Number(basis?.required_number)).toBe(20);
    } finally {
      await sandbox.close(connection, database);
    }
  });

  it('keeps demo loading idempotent and refuses destructive down after real demo BOM data', async () => {
    const { database, connection } = await sandbox.create('bom_demo');
    try {
      await applyMigrations(connection, await upMigrations());
      await insertUserFixture(connection, {
        username: 'admin',
        passwordHash: 'migration-test-only',
        displayName: 'BOM demo migration actor',
      });
      await runDemoSeed(database);
      const before = await demoProjection(connection);
      expect(before.bom.length).toBeGreaterThan(0);
      await runDemoSeed(database);
      expect(await demoProjection(connection)).toEqual(before);
      for (const name of await baselineMigrations('product', 'down')) {
        await expect(applyMigrations(connection, [name])).rejects.toMatchObject({
          cause: { code: 'ER_CHECK_CONSTRAINT_VIOLATED' },
        });
      }
      await expectCurrentBomSchema(connection);
    } finally {
      await sandbox.close(connection, database);
    }
  });
});

const expectCurrentBomSchema = async (connection: Connection): Promise<void> => {
  const snapshot = await captureSchemaSnapshot(connection);
  for (const [tableName, columnName] of [
    ['product_materials', 'is_key_material'],
    ['product_materials', 'need_batch_record'],
    ['production_material_requirement_basis', 'is_key_material_snapshot'],
    ['production_material_requirement_basis', 'need_batch_record_snapshot'],
    ['production_item_demand', 'is_key_material_snapshot'],
    ['production_item_demand', 'need_batch_record_snapshot'],
  ]) {
    expect(
      snapshot.columns.some(
        (column) => column.tableName === tableName && column.columnName === columnName,
      ),
    ).toBe(false);
  }
  expect(
    snapshot.checks.find((check) => check.constraintName === 'chk_product_materials_flags')?.clause,
  ).toMatch(/status[\s\S]*is_deleted/);
  expect(
    snapshot.checks.some(
      (check) => check.constraintName === 'chk_material_requirement_basis_flags',
    ),
  ).toBe(false);
  expect(
    snapshot.checks.some((check) => check.constraintName === 'chk_production_item_demand_flags'),
  ).toBe(false);
};

const insertBomFixture = async (connection: Connection): Promise<BomFixture> => {
  const token = `bom-flags-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const actorId = await insertUserFixture(connection, {
    username: `${token}-actor`,
    passwordHash: 'migration-test-only',
    displayName: 'BOM migration actor',
  });
  const finishedCategoryId = await insertItemCategoryFixture(connection, {
    categoryCode: `${token}-finished-category`,
    categoryName: 'BOM migration finished category',
    itemKind: 'finished_product',
    actorId,
  });
  const materialCategoryId = await insertItemCategoryFixture(connection, {
    categoryCode: `${token}-material-category`,
    categoryName: 'BOM migration material category',
    itemKind: 'material',
    actorId,
  });
  const productId = await insertProductFixture(connection, {
    itemCode: `${token}-product`,
    productName: 'BOM migration product',
    categoryId: finishedCategoryId,
    actorId,
  });
  const materialId = await insertMaterialFixture(connection, {
    materialCode: `${token}-material`,
    materialName: 'BOM migration material',
    categoryId: materialCategoryId,
    actorId,
  });
  const variantId = await insertMaterialVariantFixture(connection, {
    materialId,
    variantCode: `${token}-material-v1-A`,
    actorId,
  });
  const productMaterialSql = `INSERT INTO product_materials
         (product_id,material_id,quantity_per_unit,unit,status,remark,created_by,updated_by)
       VALUES (?,?,2,'kg',1,?, ?,?)`;
  const productMaterialId = await insert(connection, productMaterialSql, [
    productId,
    materialId,
    `${token} product BOM`,
    actorId,
    actorId,
  ]);
  const workOrderId = await insert(
    connection,
    `INSERT INTO work_orders
       (work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,
        planned_quantity,status,created_by,updated_by)
     VALUES (?,'mass_production',?,?,?,'pcs',10,'draft',?,?)`,
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
     VALUES (?,?,?,10,'pending',?,?)`,
    [workOrderId, productId, `${token}-batch`, actorId, actorId],
  );
  const basisSql = `INSERT INTO production_material_requirement_basis
         (production_batch_id,product_material_id,material_id,locked_material_variant_id,material_code_snapshot,unit_snapshot,
          quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by)
       VALUES (?,?,?,?,?,'kg',2,10,20,?)`;
  const basisId = await insert(connection, basisSql, [
    batchId,
    productMaterialId,
    materialId,
    variantId,
    `${token}-material`,
    actorId,
  ]);
  const demandSql = `INSERT INTO production_item_demand
         (production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,
          item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,unit_snapshot,
          planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,
          idempotency_key,business_status,version,created_by,updated_by)
       VALUES (?,?,?,?,?,?,?,2,'kg',10,20,20,'normal',?,?, 'active',0,?,?)`;
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
