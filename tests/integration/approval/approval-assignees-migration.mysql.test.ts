import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createConnection,
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;
const MIGRATIONS_DIR = new URL('../../../packages/database/migrations/', import.meta.url);
const TARGET_MIGRATION = '202609120001-approval-node-assignees';
const ROLLBACK_PREPARATION = '202609130001-approval-assignee-rollback-preparation';

type ConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
};

type ApprovalFixture = {
  actorId: number;
  reviewerId: number;
  roleId: number;
  specifiedUserId: number;
  definitionId: number;
  versionId: number;
  roleStepId: number;
  blockedRoleStepId: number;
  instanceId: number;
  instanceStepId: number;
  decisionInstanceStepId: number;
  taskId: number;
};

type SchemaColumn = {
  tableName: string;
  columnName: string;
  ordinalPosition: number;
  columnType: string;
  isNullable: string;
  columnDefault: string | null;
  extra: string;
  generationExpression: string;
};

type SchemaIndex = {
  tableName: string;
  indexName: string;
  sequence: number;
  columnName: string | null;
  nonUnique: number;
  indexType: string;
};

type ApprovalSchemaShape = {
  tables: Record<string, boolean>;
  columns: SchemaColumn[];
  indexes: SchemaIndex[];
};

const APPROVAL_TABLES = [
  'approval_flow_definitions',
  'approval_flow_versions',
  'approval_flow_steps',
  'approval_instances',
  'approval_instance_steps',
  'approval_tasks',
  'approval_actions',
] as const;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable: ${name}`);
  return value;
};

const temporaryDatabaseName = (prefix: string): string =>
  `${prefix.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20)}_${Date.now()}_${randomBytes(4).toString('hex')}_test`;

describeMysql('approval node assignee migration', () => {
  let admin: Connection;
  let options: ConnectionOptions;
  const temporaryDatabases = new Set<string>();

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
    // TEST_DB is only the safety marker. Every assertion runs in a fresh
    // temporary *_test schema so the shared integration database is untouched.
    admin = await createConnection({ ...options, multipleStatements: false });
  });

  afterAll(async () => {
    for (const name of temporaryDatabases) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } catch {
        // A leftover *_test schema is safer than masking the migration failure.
      }
    }
    await admin?.end();
  });

  it('upgrades populated legacy approval data and preserves roles, decisions and evidence', async () => {
    const database = temporaryDatabaseName('approval_assignees_upgrade');
    const connection = await createTemporaryDatabase(database);
    try {
      await applyMigrations(connection, await migrationsBeforeTarget());
      const fixture = await insertLegacyFixture(connection);

      await runMigration(connection, `${TARGET_MIGRATION}.up.sql`);
      await runMigration(connection, `${ROLLBACK_PREPARATION}.up.sql`);

      expect(await tableExists(connection, 'approval_tasks')).toBe(false);
      expect(await columnExists(connection, 'approval_flow_steps', 'assignee_type')).toBe(true);
      expect(await columnExists(connection, 'approval_flow_steps', 'assignee_user_id')).toBe(true);
      expect(await columnExists(connection, 'approval_actions', 'task_id')).toBe(false);
      expect(await columnExists(connection, 'approval_actions', 'decision_step_id')).toBe(true);
      expect(await columnExists(connection, 'approval_instance_steps', 'assignment_round')).toBe(
        false,
      );
      expect(await columnExists(connection, 'approval_instance_steps', 'blocked_reason')).toBe(
        false,
      );

      const [[step]] = await connection.query<RowDataPacket[]>(
        `SELECT assignee_type,role_id,assignee_user_id
           FROM approval_flow_steps WHERE id=?`,
        [fixture.roleStepId],
      );
      expect(step).toMatchObject({
        assignee_type: 'role',
        role_id: fixture.roleId,
        assignee_user_id: null,
      });

      const [[instanceStep]] = await connection.query<RowDataPacket[]>(
        `SELECT status FROM approval_instance_steps WHERE id=?`,
        [fixture.instanceStepId],
      );
      expect(instanceStep).toMatchObject({ status: 'pending' });
      const [[decisionStep]] = await connection.query<RowDataPacket[]>(
        `SELECT status FROM approval_instance_steps WHERE id=?`,
        [fixture.decisionInstanceStepId],
      );
      expect(decisionStep).toMatchObject({ status: 'approved' });

      const [[action]] = await connection.query<RowDataPacket[]>(
        `SELECT instance_id,instance_step_id,action_type,comment,created_by,details
           FROM approval_actions WHERE id=?`,
        [fixture.actionId],
      );
      expect(action).toMatchObject({
        instance_id: fixture.instanceId,
        instance_step_id: fixture.decisionInstanceStepId,
        action_type: 'approved',
        comment: 'legacy actual decision',
        created_by: fixture.reviewerId,
      });
      expect(parseJson(action?.details)).toEqual({ evidence: 'legacy-proof' });

      const [[instance]] = await connection.query<RowDataPacket[]>(
        `SELECT subject_snapshot,created_by FROM approval_instances WHERE id=?`,
        [fixture.instanceId],
      );
      expect(instance?.created_by).toBe(fixture.actorId);
      expect(parseJson(instance?.subject_snapshot)).toEqual({
        productId: 'legacy-product',
        itemCode: 'LEGACY-001',
        materials: [{ materialId: 'legacy-material', quantity: '2' }],
      });
    } finally {
      await closeTemporaryDatabase(connection, database);
    }
  });

  it('enforces role/user XOR and assignee foreign keys, and accepts one decision per node', async () => {
    const database = temporaryDatabaseName('approval_assignees_constraints');
    const connection = await createTemporaryDatabase(database);
    try {
      await applyMigrations(connection, await allMigrations());
      const fixture = await insertCurrentFixture(connection, 'role');

      const userStepId = await insert(
        connection,
        `INSERT INTO approval_flow_steps
           (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
         VALUES (?,?,?,'指定用户','user',NULL,?,?)`,
        [fixture.versionId, 'specified-user', 2, fixture.specifiedUserId, fixture.actorId],
      );
      expect(userStepId).toBeGreaterThan(0);

      await expect(
        connection.execute(
          `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
           VALUES (?,?,?,'两者同时填写','user',?,?,?)`,
          [
            fixture.versionId,
            'both-assignees',
            3,
            fixture.roleId,
            fixture.specifiedUserId,
            fixture.actorId,
          ],
        ),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

      await expect(
        connection.execute(
          `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
           VALUES (?,?,?,'缺少审批对象','role',NULL,NULL,?)`,
          [fixture.versionId, 'missing-assignee', 3, fixture.actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

      await expect(
        connection.execute(
          `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
           VALUES (?,?,?,'无效用户','user',NULL,?,?)`,
          [fixture.versionId, 'unknown-user', 3, 999999999, fixture.actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

      await expect(
        connection.execute(
          `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
           VALUES (?,?,?,'无效角色','role',?,NULL,?)`,
          [fixture.versionId, 'unknown-role', 3, 999999999, fixture.actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

      const instanceId = await insertApprovalInstance(connection, fixture);
      const instanceStepId = await insert(
        connection,
        `INSERT INTO approval_instance_steps
           (instance_id,flow_step_id,step_no,status,activated_at,created_by)
         VALUES (?,?,1,'pending',CURRENT_TIMESTAMP,?)`,
        [instanceId, fixture.roleStepId, fixture.actorId],
      );
      const actionId = await insert(
        connection,
        `INSERT INTO approval_actions
           (instance_id,action_no,instance_step_id,action_type,comment,created_by)
         VALUES (?,?,?,'approved','first decision',?)`,
        [instanceId, 1, instanceStepId, fixture.reviewerId],
      );
      expect(actionId).toBeGreaterThan(0);

      const [[decision]] = await connection.query<RowDataPacket[]>(
        `SELECT decision_step_id FROM approval_actions WHERE id=?`,
        [actionId],
      );
      expect(Number(decision?.decision_step_id)).toBe(instanceStepId);

      await expect(
        connection.execute(
          `INSERT INTO approval_actions
             (instance_id,action_no,instance_step_id,action_type,comment,created_by)
           VALUES (?,?,?,'rejected','second decision',?)`,
          [instanceId, 2, instanceStepId, fixture.actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

      const indexes = await schemaIndexes(connection, ['approval_flow_steps', 'approval_actions']);
      expect(indexes).toContainEqual({
        tableName: 'approval_flow_steps',
        indexName: 'idx_approval_flow_steps_user',
        sequence: 1,
        columnName: 'assignee_user_id',
        nonUnique: 1,
        indexType: 'BTREE',
      });
      expect(indexes).toContainEqual({
        tableName: 'approval_flow_steps',
        indexName: 'idx_approval_flow_steps_user',
        sequence: 2,
        columnName: 'flow_version_id',
        nonUnique: 1,
        indexType: 'BTREE',
      });
      expect(indexes).toContainEqual({
        tableName: 'approval_actions',
        indexName: 'uk_approval_actions_decision_step',
        sequence: 1,
        columnName: 'decision_step_id',
        nonUnique: 0,
        indexType: 'BTREE',
      });
      expect(userStepId).toBeGreaterThan(fixture.roleStepId);
    } finally {
      await closeTemporaryDatabase(connection, database);
    }
  });

  it('rejects down before DDL when an approval instance exists', async () => {
    const database = temporaryDatabaseName('approval_assignees_down_instance_guard');
    const connection = await createTemporaryDatabase(database);
    try {
      await applyMigrations(connection, await allMigrations());
      const fixture = await insertCurrentFixture(connection, 'role');
      await insertApprovalInstance(connection, fixture);
      const before = await approvalSchemaShape(connection);

      for (const migration of [ROLLBACK_PREPARATION, TARGET_MIGRATION]) {
        await expect(runMigration(connection, `${migration}.down.sql`)).rejects.toMatchObject({
          code: 'ER_CHECK_CONSTRAINT_VIOLATED',
        });
        await dropRollbackGuard(connection);
        expect(await approvalSchemaShape(connection)).toEqual(before);
      }

      expect(await approvalSchemaShape(connection)).toEqual(before);
      const [[row]] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM approval_instances`,
      );
      expect(Number(row?.count)).toBe(1);
    } finally {
      await closeTemporaryDatabase(connection, database);
    }
  });

  it('rejects down before DDL when a specified-user flow step exists', async () => {
    const database = temporaryDatabaseName('approval_assignees_down_user_guard');
    const connection = await createTemporaryDatabase(database);
    try {
      await applyMigrations(connection, await allMigrations());
      const fixture = await insertCurrentFixture(connection, 'user');
      const before = await approvalSchemaShape(connection);

      for (const migration of [ROLLBACK_PREPARATION, TARGET_MIGRATION]) {
        await expect(runMigration(connection, `${migration}.down.sql`)).rejects.toMatchObject({
          code: 'ER_CHECK_CONSTRAINT_VIOLATED',
        });
        await dropRollbackGuard(connection);
        expect(await approvalSchemaShape(connection)).toEqual(before);
      }

      expect(await approvalSchemaShape(connection)).toEqual(before);
      const [[row]] = await connection.query<RowDataPacket[]>(
        `SELECT assignee_type,role_id,assignee_user_id
           FROM approval_flow_steps WHERE id=?`,
        [fixture.roleStepId],
      );
      expect(row).toMatchObject({
        assignee_type: 'user',
        role_id: null,
        assignee_user_id: fixture.specifiedUserId,
      });
    } finally {
      await closeTemporaryDatabase(connection, database);
    }
  });

  it('round-trips an empty legacy schema through target up/down/up with fields and indexes restored', async () => {
    const database = temporaryDatabaseName('approval_assignees_empty_roundtrip');
    const connection = await createTemporaryDatabase(database);
    try {
      await applyMigrations(connection, await migrationsBeforeTarget());
      const legacyShape = await approvalSchemaShape(connection);
      expect(legacyShape.tables.approval_tasks).toBe(true);
      expect(await permissionExists(connection, 'approval:reassign')).toBe(true);

      await runMigration(connection, `${TARGET_MIGRATION}.up.sql`);
      await runMigration(connection, `${ROLLBACK_PREPARATION}.up.sql`);
      const currentShape = await approvalSchemaShape(connection);
      expect(currentShape.tables.approval_tasks).toBe(false);
      expect(await permissionExists(connection, 'approval:reassign')).toBe(false);
      expect(hasColumn(currentShape, 'approval_flow_steps', 'assignee_type')).toBe(true);
      expect(hasColumn(currentShape, 'approval_flow_steps', 'assignee_user_id')).toBe(true);
      expect(hasColumn(currentShape, 'approval_actions', 'decision_step_id')).toBe(true);
      expect(hasColumn(currentShape, 'approval_instance_steps', 'assignment_round')).toBe(false);
      expect(hasColumn(currentShape, 'approval_instance_steps', 'blocked_reason')).toBe(false);

      // An interrupted preparation can return to the current schema before serving traffic.
      await runMigration(connection, `${ROLLBACK_PREPARATION}.down.sql`);
      await runMigration(connection, `${ROLLBACK_PREPARATION}.up.sql`);
      expect(await approvalSchemaShape(connection)).toEqual(currentShape);

      await runMigration(connection, `${ROLLBACK_PREPARATION}.down.sql`);
      await runMigration(connection, `${TARGET_MIGRATION}.down.sql`);
      expect(await approvalSchemaShape(connection)).toEqual(legacyShape);
      expect(await permissionExists(connection, 'approval:reassign')).toBe(true);

      await runMigration(connection, `${TARGET_MIGRATION}.up.sql`);
      await runMigration(connection, `${ROLLBACK_PREPARATION}.up.sql`);
      expect(await approvalSchemaShape(connection)).toEqual(currentShape);
      expect(await permissionExists(connection, 'approval:reassign')).toBe(false);
    } finally {
      await closeTemporaryDatabase(connection, database);
    }
  });

  const createTemporaryDatabase = async (name: string): Promise<Connection> => {
    await admin.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    temporaryDatabases.add(name);
    return createConnection({ ...options, database: name, multipleStatements: true });
  };

  const closeTemporaryDatabase = async (connection: Connection, name: string): Promise<void> => {
    await connection.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    temporaryDatabases.delete(name);
  };
});

const allMigrations = async (): Promise<string[]> =>
  (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.up.sql')).sort();

const migrationsBeforeTarget = async (): Promise<string[]> =>
  (await allMigrations()).filter((name) => name < `${TARGET_MIGRATION}.up.sql`);

const runMigration = async (connection: Connection, name: string): Promise<void> => {
  const sql = await readFile(new URL(name, MIGRATIONS_DIR), 'utf8');
  await connection.query(sql);
};

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

const insert = async (
  connection: Connection,
  sql: string,
  values: (string | number | null)[],
): Promise<number> => {
  const [result] = await connection.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const insertUser = async (
  connection: Connection,
  token: string,
  displayName: string,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO users (username,password_hash,display_name)
     VALUES (?,?,?)`,
    [`${token}-${displayName}`, 'migration-test-only', displayName],
  );

const insertRole = async (connection: Connection, token: string): Promise<number> =>
  insert(connection, `INSERT INTO roles (name,code) VALUES (?,?)`, [
    `${token}审批角色`,
    `${token}-role`,
  ]);

const insertFlow = async (
  connection: Connection,
  actorId: number,
  roleId: number,
  specifiedUserId: number,
  assigneeType: 'role' | 'user',
): Promise<Pick<ApprovalFixture, 'definitionId' | 'versionId' | 'roleStepId'>> => {
  const token = `approval-flow-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const definitionId = await insert(
    connection,
    `INSERT INTO approval_flow_definitions
       (scene_code,name,created_by,updated_by)
     VALUES (?,?,?,?)`,
    [`${token}.scene`, `${token}流程`, actorId, actorId],
  );
  const versionId = await insert(
    connection,
    `INSERT INTO approval_flow_versions
       (definition_id,version_no,status,published_by,published_at,created_by,updated_by)
     VALUES (?,1,'published',?,CURRENT_TIMESTAMP,?,?)`,
    [definitionId, actorId, actorId, actorId],
  );
  const roleStepId = await insert(
    connection,
    `INSERT INTO approval_flow_steps
       (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
     VALUES (?,?,1,?,?,?,?,?)`,
    [
      versionId,
      'first-step',
      '第一节点',
      assigneeType,
      assigneeType === 'role' ? roleId : null,
      assigneeType === 'user' ? specifiedUserId : null,
      actorId,
    ],
  );
  await connection.execute(
    `UPDATE approval_flow_definitions SET published_version_id=? WHERE id=?`,
    [versionId, definitionId],
  );
  return { definitionId, versionId, roleStepId };
};

const insertCurrentFixture = async (
  connection: Connection,
  assigneeType: 'role' | 'user',
): Promise<ApprovalFixture> => {
  const token = `approval-current-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const actorId = await insertUser(connection, token, 'migration actor');
  const reviewerId = await insertUser(connection, token, 'actual reviewer');
  const specifiedUserId = await insertUser(connection, token, 'specified reviewer');
  const roleId = await insertRole(connection, token);
  const flow = await insertFlow(connection, actorId, roleId, specifiedUserId, assigneeType);
  return {
    actorId,
    reviewerId,
    roleId,
    specifiedUserId,
    ...flow,
    instanceId: 0,
    instanceStepId: 0,
    blockedRoleStepId: 0,
    decisionInstanceStepId: 0,
    taskId: 0,
  };
};

const insertApprovalInstance = async (
  connection: Connection,
  fixture: ApprovalFixture,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO approval_instances
       (instance_no,scene_code,subject_type,subject_id,flow_version_id,title,subject_version,
        snapshot_schema_version,subject_snapshot,policy_snapshot,status,created_by,updated_by)
     VALUES (?,(SELECT scene_code FROM approval_flow_definitions WHERE published_version_id=?),
       'product',1,?,'迁移测试申请',1,2,?,?,'pending',?,?)`,
    [
      `approval-instance-${Date.now()}-${randomBytes(4).toString('hex')}`,
      fixture.versionId,
      fixture.versionId,
      JSON.stringify({
        productId: 'current-product',
        itemCode: 'CURRENT-001',
        materials: [{ materialId: 'current-material', quantity: '1' }],
      }),
      JSON.stringify({ allowSelfApproval: true }),
      fixture.actorId,
      fixture.actorId,
    ],
  );

const insertLegacyFixture = async (
  connection: Connection,
): Promise<ApprovalFixture & { actionId: number }> => {
  const token = `approval-legacy-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const actorId = await insertUser(connection, token, 'legacy applicant');
  const reviewerId = await insertUser(connection, token, 'legacy actual reviewer');
  const specifiedUserId = await insertUser(connection, token, 'legacy unused user');
  const roleId = await insertRole(connection, token);
  const flow = await insertLegacyFlow(connection, actorId, roleId);
  const instanceId = await insert(
    connection,
    `INSERT INTO approval_instances
       (instance_no,scene_code,subject_type,subject_id,flow_version_id,title,subject_version,
        snapshot_schema_version,subject_snapshot,policy_snapshot,status,created_by,updated_by)
     VALUES (?,(SELECT scene_code FROM approval_flow_definitions WHERE id=?),'product',1,?,
       'legacy approval',1,1,?,?,'pending',?,?)`,
    [
      `legacy-instance-${Date.now()}-${randomBytes(4).toString('hex')}`,
      flow.definitionId,
      flow.versionId,
      JSON.stringify({
        productId: 'legacy-product',
        itemCode: 'LEGACY-001',
        materials: [{ materialId: 'legacy-material', quantity: '2' }],
      }),
      JSON.stringify({ allowSelfApproval: true }),
      actorId,
      actorId,
    ],
  );
  const decisionInstanceStepId = await insert(
    connection,
    `INSERT INTO approval_instance_steps
       (instance_id,flow_step_id,step_no,status,assignment_round,activated_at,ended_at,created_by)
     VALUES (?,?,1,'approved',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)`,
    [instanceId, flow.roleStepId, actorId],
  );
  const instanceStepId = await insert(
    connection,
    `INSERT INTO approval_instance_steps
       (instance_id,flow_step_id,step_no,status,assignment_round,blocked_reason,activated_at,created_by)
     VALUES (?,?,2,'blocked',2,'no_eligible_assignee',CURRENT_TIMESTAMP,?)`,
    [instanceId, flow.blockedRoleStepId, actorId],
  );
  const taskId = await insert(
    connection,
    `INSERT INTO approval_tasks
       (instance_step_id,assignment_round,assignee_id,status,ended_at,created_by)
     VALUES (?,1,?,'approved',CURRENT_TIMESTAMP,?)`,
    [decisionInstanceStepId, reviewerId, actorId],
  );
  await insert(
    connection,
    `INSERT INTO approval_actions
       (instance_id,action_no,action_type,created_by)
     VALUES (?,1,'submitted',?)`,
    [instanceId, actorId],
  );
  const actionId = await insert(
    connection,
    `INSERT INTO approval_actions
       (instance_id,action_no,instance_step_id,task_id,action_type,comment,details,created_by)
     VALUES (?,2,?,?,'approved','legacy actual decision',?,?)`,
    [
      instanceId,
      decisionInstanceStepId,
      taskId,
      JSON.stringify({ evidence: 'legacy-proof' }),
      reviewerId,
    ],
  );
  return {
    actorId,
    reviewerId,
    roleId,
    specifiedUserId,
    definitionId: flow.definitionId,
    versionId: flow.versionId,
    roleStepId: flow.roleStepId,
    blockedRoleStepId: flow.blockedRoleStepId,
    instanceId,
    instanceStepId,
    decisionInstanceStepId,
    taskId,
    actionId,
  };
};

const insertLegacyFlow = async (
  connection: Connection,
  actorId: number,
  roleId: number,
): Promise<
  Pick<ApprovalFixture, 'definitionId' | 'versionId' | 'roleStepId' | 'blockedRoleStepId'>
> => {
  const token = `approval-legacy-flow-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const definitionId = await insert(
    connection,
    `INSERT INTO approval_flow_definitions
       (scene_code,name,created_by,updated_by)
     VALUES (?,?,?,?)`,
    [`${token}.scene`, `${token}流程`, actorId, actorId],
  );
  const versionId = await insert(
    connection,
    `INSERT INTO approval_flow_versions
       (definition_id,version_no,status,published_by,published_at,created_by,updated_by)
     VALUES (?,1,'published',?,CURRENT_TIMESTAMP,?,?)`,
    [definitionId, actorId, actorId, actorId],
  );
  const roleStepId = await insert(
    connection,
    `INSERT INTO approval_flow_steps
       (flow_version_id,node_code,step_no,name,role_id,created_by)
     VALUES (?,?,1,'旧角色节点',?,?)`,
    [versionId, 'legacy-role', roleId, actorId],
  );
  const blockedRoleStepId = await insert(
    connection,
    `INSERT INTO approval_flow_steps
       (flow_version_id,node_code,step_no,name,role_id,created_by)
     VALUES (?,?,2,'旧阻塞节点',?,?)`,
    [versionId, 'legacy-blocked-role', roleId, actorId],
  );
  await connection.execute(
    `UPDATE approval_flow_definitions SET published_version_id=? WHERE id=?`,
    [versionId, definitionId],
  );
  return { definitionId, versionId, roleStepId, blockedRoleStepId };
};

const tableExists = async (connection: Connection, tableName: string): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema=DATABASE() AND table_name=?`,
    [tableName],
  );
  return Number(row?.count ?? 0) === 1;
};

const columnExists = async (
  connection: Connection,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
    [tableName, columnName],
  );
  return Number(row?.count ?? 0) === 1;
};

const permissionExists = async (connection: Connection, code: string): Promise<boolean> => {
  const [[row]] = await connection.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) AS count FROM permissions WHERE code=?`,
    [code],
  );
  return Number(row?.count ?? 0) === 1;
};

const schemaIndexes = async (
  connection: Connection,
  tableNames: readonly string[],
): Promise<SchemaIndex[]> => {
  const placeholders = tableNames.map(() => '?').join(',');
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT table_name AS tableName,index_name AS indexName,seq_in_index AS sequence,
            column_name AS columnName,non_unique AS nonUnique,index_type AS indexType
       FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name IN (${placeholders})
      ORDER BY table_name,index_name,seq_in_index`,
    [...tableNames],
  );
  return rows.map((row) => ({
    tableName: String(row.tableName),
    indexName: String(row.indexName),
    sequence: Number(row.sequence),
    columnName: row.columnName === null ? null : String(row.columnName),
    nonUnique: Number(row.nonUnique),
    indexType: String(row.indexType),
  }));
};

const approvalSchemaShape = async (connection: Connection): Promise<ApprovalSchemaShape> => {
  const placeholders = APPROVAL_TABLES.map(() => '?').join(',');
  const tables: Record<string, boolean> = {};
  for (const tableName of APPROVAL_TABLES) {
    tables[tableName] = await tableExists(connection, tableName);
  }
  const [columnRows] = await connection.query<RowDataPacket[]>(
    `SELECT table_name AS tableName,column_name AS columnName,ordinal_position AS ordinalPosition,
            column_type AS columnType,is_nullable AS isNullable,column_default AS columnDefault,
            extra,generation_expression AS generationExpression
       FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name IN (${placeholders})
      ORDER BY table_name,ordinal_position`,
    [...APPROVAL_TABLES],
  );
  const columns = columnRows.map((row) => ({
    tableName: String(row.tableName),
    columnName: String(row.columnName),
    ordinalPosition: Number(row.ordinalPosition),
    columnType: String(row.columnType),
    isNullable: String(row.isNullable),
    columnDefault: row.columnDefault === null ? null : String(row.columnDefault),
    extra: String(row.extra),
    generationExpression: String(row.generationExpression ?? ''),
  }));
  return { tables, columns, indexes: await schemaIndexes(connection, APPROVAL_TABLES) };
};

const hasColumn = (shape: ApprovalSchemaShape, tableName: string, columnName: string): boolean =>
  shape.columns.some(
    (column) => column.tableName === tableName && column.columnName === columnName,
  );

const dropRollbackGuard = async (connection: Connection): Promise<void> => {
  await connection.query('DROP TEMPORARY TABLE IF EXISTS tmp_approval_node_rollback_guard');
};

const parseJson = (value: unknown): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;
