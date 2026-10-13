import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import {
  createConnection,
  type Connection,
  type RowDataPacket,
} from '../../../../apps/api/node_modules/mysql2/promise.js';
import { readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MIGRATIONS_DIR,
  type ConnectionOptions,
  applyMigrations,
  upMigrations,
  tableExists,
  insert,
  required,
} from '../../fixtures/mysql-migration-fixture.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Inventory item balance migrations', () => {
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

  it('rebuilds the legacy item-balance projection on down and removes it again on up', async () => {
    const tempDb = `ssp_mig_item_balance_${Date.now()}_test`;
    const connection = await createTempDatabase(tempDb);
    let fixture: ItemBalanceProjectionFixture | undefined;
    try {
      await applyMigrations(connection, await upMigrations());
      await expectItemBalanceProjection(connection, false);

      // Leave a ledger fact in place before the down migration so its backfill
      // is observable rather than merely proving that an empty table exists.
      fixture = await insertItemBalanceProjectionFixture(connection);
      await applyMigrations(connection, await downMigrationsFor(['202609080001']));
      await expectItemBalanceProjection(connection, true);
      const [[backfilled]] = await connection.query<
        (RowDataPacket & { current_quantity: string | number })[]
      >(
        `SELECT current_quantity FROM inventory_item_balance
         WHERE item_id=? AND stock_status='available' AND batch_status='available'`,
        [fixture.materialId],
      );
      expect(Number(backfilled?.current_quantity)).toBe(7);

      await deleteItemBalanceProjectionFixture(connection, fixture);
      await applyMigrations(connection, await upMigrationsFor(['202609080001']));
      await expectItemBalanceProjection(connection, false);
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

const upMigrationsFor = async (prefixes: string[]): Promise<string[]> => {
  const names = await upMigrations();
  return names.filter((name) => prefixes.includes(name.slice(0, 12)));
};

const downMigrationsFor = async (prefixes: string[]): Promise<string[]> => {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.down.sql')).sort();
  return prefixes
    .slice()
    .reverse()
    .flatMap((prefix) => names.filter((name) => name.startsWith(prefix)));
};

const triggerExists = async (connection: Connection, trigger: string): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) count FROM information_schema.triggers
     WHERE trigger_schema=DATABASE() AND trigger_name=?`,
    [trigger],
  );
  return Number(row?.count ?? 0) === 1;
};

const expectItemBalanceProjection = async (
  connection: Connection,
  expected: boolean,
): Promise<void> => {
  expect(await tableExists(connection, 'inventory_item_balance')).toBe(expected);
  for (const trigger of [
    'trg_inventory_item_balance_reject_negative_insert',
    'trg_inventory_item_balance_reject_negative_update',
    'trg_item_batch_move_item_balance',
  ]) {
    expect(await triggerExists(connection, trigger)).toBe(expected);
  }
  // 080001 keeps these names for the batch-level projection; only their
  // obsolete item-balance branch is removed.
  expect(await triggerExists(connection, 'trg_inventory_transaction_update_balances')).toBe(true);
  expect(await triggerExists(connection, 'trg_inventory_transaction_cleanup_balances')).toBe(true);
};

type ItemBalanceProjectionFixture = {
  actorId: number;
  categoryId: number;
  materialId: number;
  materialVariantId: number;
  itemBatchId: number;
  transactionId: number;
};

const insertItemBalanceProjectionFixture = async (
  connection: Connection,
): Promise<ItemBalanceProjectionFixture> => {
  const token = `item-balance-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const actorId = await insert(
    connection,
    'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)',
    [`${token}-actor`, 'migration-test-only', 'Inventory migration actor'],
  );
  const categoryId = await insert(
    connection,
    "INSERT INTO item_categories (category_code,category_name,item_kind) VALUES (?,?,'material')",
    [`${token}-category`, 'Inventory migration material'],
  );
  const materialId = await insert(
    connection,
    `INSERT INTO materials
       (material_code,material_name,category_id,unit,acquire_method,created_by,updated_by)
     VALUES (?,? ,?,'kg','purchased',?,?)`,
    [`${token}-material`, 'Inventory migration material', categoryId, actorId, actorId],
  );
  const materialVariantId = await insert(
    connection,
    `INSERT INTO material_variants
       (material_id,major_version,minor_version,variant_code,created_by,updated_by)
     VALUES (?,'v1','A',?,?,?)`,
    [materialId, `${token}-v1-A`, actorId, actorId],
  );
  const itemBatchId = await insert(
    connection,
    `INSERT INTO item_batch
       (item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,
        unit_snapshot,batch_code,source_type,created_by,updated_by)
     VALUES (?,?,?,?,'kg',?,'purchased',?,?)`,
    [
      materialId,
      materialVariantId,
      `${token}-material`,
      `${token}-v1-A`,
      `${token}-batch`,
      actorId,
      actorId,
    ],
  );
  const transactionId = await insert(
    connection,
    `INSERT INTO inventory_transaction
       (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,
        stock_status,reference_type,reference_detail_id,idempotency_key,created_by)
     VALUES (?,?,?,'purchase_inbound','7.0000','kg','available','manual',0,?,?)`,
    [materialId, materialVariantId, itemBatchId, `${token}-opening`, actorId],
  );
  return { actorId, categoryId, materialId, materialVariantId, itemBatchId, transactionId };
};

const deleteItemBalanceProjectionFixture = async (
  connection: Connection,
  fixture: ItemBalanceProjectionFixture,
): Promise<void> => {
  await connection.query('SET @company_inventory_test_cleanup = 1');
  try {
    await connection.execute('DELETE FROM inventory_transaction WHERE id=?', [
      fixture.transactionId,
    ]);
  } finally {
    await connection.query('SET @company_inventory_test_cleanup = NULL');
  }
  await connection.execute('DELETE FROM item_batch WHERE id=?', [fixture.itemBatchId]);
  await connection.execute('DELETE FROM material_variants WHERE id=?', [fixture.materialVariantId]);
  await connection.execute('DELETE FROM materials WHERE id=?', [fixture.materialId]);
  await connection.execute('DELETE FROM item_categories WHERE id=?', [fixture.categoryId]);
  await connection.execute('DELETE FROM users WHERE id=?', [fixture.actorId]);
};
