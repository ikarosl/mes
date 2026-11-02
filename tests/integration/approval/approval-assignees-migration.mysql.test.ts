import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import type { Connection, RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type MigrationSandbox,
  applyMigrations,
  baselineMigrations,
  createMigrationSandbox,
  insert,
  upMigrations,
} from '../fixtures/mysql-migration-fixture.js';
import { captureSchemaSnapshot } from '../fixtures/mysql-schema-snapshot.js';

loadWorkspaceEnv();
const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

type ApprovalFixture = {
  actorId: number;
  reviewerId: number;
  roleId: number;
  specifiedUserId: number;
  definitionId: number;
  versionId: number;
  roleStepId: number;
};

type SchemaIndex = {
  tableName: string;
  indexName: string;
  sequence: number;
  columnName: string | null;
  nonUnique: number;
  indexType: string;
};

describeMysql('Approval baseline constraints (real MySQL)', () => {
  let sandbox: MigrationSandbox;
  beforeAll(async () => {
    sandbox = await createMigrationSandbox();
  });
  afterAll(async () => {
    await sandbox?.dispose();
  });

  it('enforces exclusive role/user/business assignees and foreign keys, and accepts one decision per node', async () => {
    const { database, connection } = await sandbox.create('approval_constraints');
    try {
      await applyMigrations(connection, await upMigrations());
      const fixture = await insertCurrentFixture(connection, 'role');

      const userStepId = await insert(
        connection,
        `INSERT INTO approval_flow_steps
           (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
         VALUES (?,?,?,'指定用户','user',NULL,?,?)`,
        [fixture.versionId, 'specified-user', 2, fixture.specifiedUserId, fixture.actorId],
      );
      expect(userStepId).toBeGreaterThan(0);

      const businessStepId = await insert(
        connection,
        `INSERT INTO approval_flow_steps
           (flow_version_id,node_code,step_no,name,assignee_type,assignee_source_code,created_by)
         VALUES (?, 'business-owner', 3, '业务来源', 'business', 'work_order_owner', ?)`,
        [fixture.versionId, fixture.actorId],
      );
      expect(businessStepId).toBeGreaterThan(0);
      for (const [code, source, role] of [
        ['empty-source', ' ', null],
        ['both-source-role', 'work_order_owner', fixture.roleId],
      ] as const) {
        await expect(
          connection.execute(
            `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,assignee_source_code,role_id,created_by)
           VALUES (?, ?, 4, '无效业务来源', 'business', ?, ?, ?)`,
            [fixture.versionId, code, source, role, fixture.actorId],
          ),
        ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      }

      await expect(
        connection.execute(
          `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
           VALUES (?,?,?,'两者同时填写','user',?,?,?)`,
          [
            fixture.versionId,
            'both-assignees',
            4,
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
          [fixture.versionId, 'missing-assignee', 4, fixture.actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });

      await expect(
        connection.execute(
          `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
           VALUES (?,?,?,'无效用户','user',NULL,?,?)`,
          [fixture.versionId, 'unknown-user', 4, 999999999, fixture.actorId],
        ),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });

      await expect(
        connection.execute(
          `INSERT INTO approval_flow_steps
             (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,created_by)
           VALUES (?,?,?,'无效角色','role',?,NULL,?)`,
          [fixture.versionId, 'unknown-role', 4, 999999999, fixture.actorId],
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
      await sandbox.close(connection, database);
    }
  });

  it.each(['role', 'user'] as const)(
    'keeps all schema and approval evidence when %s flow data blocks every module down phase',
    async (assigneeType) => {
      const { connection, database } = await sandbox.create('approval_guard');
      try {
        await applyMigrations(connection, await upMigrations());
        const fixture = await insertCurrentFixture(connection, assigneeType);
        const instanceId = await insertApprovalInstance(connection, fixture);
        const before = await captureSchemaSnapshot(connection);
        for (const name of await baselineMigrations('approval', 'down')) {
          await expect(applyMigrations(connection, [name])).rejects.toMatchObject({
            cause: { code: 'ER_CHECK_CONSTRAINT_VIOLATED' },
          });
          expect(await captureSchemaSnapshot(connection)).toEqual(before);
        }
        const [[row]] = await connection.query<RowDataPacket[]>(
          'SELECT subject_snapshot,created_by FROM approval_instances WHERE id=?',
          [instanceId],
        );
        expect(Number(row?.created_by)).toBe(fixture.actorId);
        expect(
          typeof row?.subject_snapshot === 'string'
            ? JSON.parse(row.subject_snapshot)
            : row?.subject_snapshot,
        ).toMatchObject({ productId: 'current-product', itemCode: 'CURRENT-001' });
      } finally {
        await sandbox.close(connection, database);
      }
    },
  );
});

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
