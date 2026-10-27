import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { CONCURRENCY_ERROR_CODES, SYSTEM_STATUS } from '@company/constants';
import type {
  UpdateUserCandidateConfigRequest,
  UserCandidateSceneCode,
  UserOption,
} from '@company/contracts';
import { withActiveConnection, withTransaction } from '@company/database';
import type { AuditLogEntry } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import {
  ConcurrencyError,
  requireOptimisticUpdate,
} from '../../../common/persistence/optimistic-lock.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type {
  UserCandidateConfiguration,
  UserCandidateRepository,
} from '../application/ports/user-candidate.repository.js';
import { UserCandidateConfigError } from '../domain/user-candidate.errors.js';

type Queryable = Pick<PoolConnection, 'query'>;
type ConfigRow = RowDataPacket & {
  id: string;
  scene_code: UserCandidateSceneCode;
  version: number;
  is_deleted: number;
};
type RoleStateRow = RowDataPacket & {
  id: string;
  status: number;
  deleted_at: Date | null;
};

@Injectable()
export class MysqlUserCandidateRepository implements UserCandidateRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  listConfigurations(): Promise<UserCandidateConfiguration[]> {
    return withActiveConnection(this.pool, (connection) => readConfigurations(connection));
  }

  async saveConfiguration(
    sceneCode: UserCandidateSceneCode,
    payload: UpdateUserCandidateConfigRequest,
    audit: AuditLogEntry,
  ): Promise<UserCandidateConfiguration> {
    try {
      return await withTransaction(this.pool, async (connection) => {
        // 审计外键先锁操作者，随后配置和角色；与用户角色替换的 user -> role 锁序一致。
        if (audit.userId) {
          await connection.query('SELECT id FROM users WHERE id=? FOR SHARE', [audit.userId]);
        }
        const current = await lockConfiguration(connection, sceneCode, payload, audit.userId);
        const roleIds = [...payload.roleIds].sort(compareNumericId);
        for (const roleId of roleIds) {
          const role = await lockRole(connection, roleId);
          if (!role || role.status !== SYSTEM_STATUS.enabled || role.deleted_at !== null)
            throw new UserCandidateConfigError('所选角色不存在、已停用或已删除，请刷新后重新选择');
        }
        const [previousRoles] = await connection.query<(RowDataPacket & { role_id: string })[]>(
          'SELECT role_id FROM user_candidate_config_roles WHERE config_id=? ORDER BY role_id FOR UPDATE',
          [current.id],
        );
        let nextVersion = current.version;
        if (payload.version !== null) {
          const [result] = await connection.execute<ResultSetHeader>(
            'UPDATE user_candidate_configs SET version=version+1,updated_by=? WHERE id=? AND version=? AND is_deleted=0',
            [audit.userId ?? null, current.id, payload.version],
          );
          requireOptimisticUpdate(result.affectedRows);
          nextVersion += 1;
        }
        await connection.execute('DELETE FROM user_candidate_config_roles WHERE config_id=?', [
          current.id,
        ]);
        for (const roleId of roleIds) {
          await connection.execute(
            'INSERT INTO user_candidate_config_roles (config_id,role_id) VALUES (?,?)',
            [current.id, roleId],
          );
        }
        await writeTransactionalAudit(connection, {
          ...audit,
          targetId: current.id,
          targetType: 'user_candidate_config',
          beforeData:
            payload.version === null
              ? null
              : {
                  sceneCode,
                  version: current.version,
                  roleIds: previousRoles.map((role) => String(role.role_id)),
                },
          afterData: { sceneCode, version: nextVersion, roleIds },
        });
        const saved = (await readConfigurations(connection, sceneCode))[0];
        if (!saved) throw new Error('保存后的业务人员配置不存在');
        return saved;
      });
    } catch (error) {
      // 首次保存直接插入唯一自然键，避免两个空记录 gap lock 升级造成的创建竞争。
      if (databaseCode(error) === 'ER_DUP_ENTRY' && payload.version === null)
        throw configurationConflict();
      throw error;
    }
  }

  async listCandidates(sceneCode: UserCandidateSceneCode): Promise<UserOption[]> {
    return withActiveConnection(this.pool, async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & { id: string; display_name: string })[]
      >(
        `SELECT DISTINCT u.id,u.display_name
           FROM user_candidate_configs c
           JOIN user_candidate_config_roles cr ON cr.config_id=c.id
           JOIN roles r ON r.id=cr.role_id AND r.status=? AND r.deleted_at IS NULL
           JOIN user_roles ur ON ur.role_id=r.id
           JOIN users u ON u.id=ur.user_id AND u.status=? AND u.deleted_at IS NULL
          WHERE c.scene_code=? AND c.is_deleted=0
          ORDER BY u.display_name,u.id`,
        [SYSTEM_STATUS.enabled, SYSTEM_STATUS.enabled, sceneCode],
      );
      return rows.map((row) => ({ id: String(row.id), displayName: row.display_name }));
    });
  }

  isEligible(sceneCode: UserCandidateSceneCode, userId: string): Promise<boolean> {
    return withTransaction(this.pool, async (connection) => {
      // 先锁目标用户，再锁配置、角色及成员；不从 role 反向锁 user。
      const [users] = await connection.query<RoleStateRow[]>(
        'SELECT id,status,deleted_at FROM users WHERE id=? FOR SHARE',
        [userId],
      );
      const user = users[0];
      if (!user || user.status !== SYSTEM_STATUS.enabled || user.deleted_at !== null) return false;
      const [configs] = await connection.query<ConfigRow[]>(
        'SELECT id,scene_code,version,is_deleted FROM user_candidate_configs WHERE scene_code=? FOR SHARE',
        [sceneCode],
      );
      const config = configs[0];
      if (!config || config.is_deleted !== 0) return false;
      // 关联同样用当前读；不能混用调用事务早先建立的 RR 快照。
      const [configuredRoles] = await connection.query<(RowDataPacket & { role_id: string })[]>(
        'SELECT role_id FROM user_candidate_config_roles WHERE config_id=? ORDER BY role_id FOR SHARE',
        [config.id],
      );
      const eligibleRoleIds = new Set<string>();
      for (const configuredRole of configuredRoles) {
        const roleId = String(configuredRole.role_id);
        const role = await lockRole(connection, roleId);
        if (role?.status === SYSTEM_STATUS.enabled && role.deleted_at === null)
          eligibleRoleIds.add(roleId);
      }
      if (eligibleRoleIds.size === 0) return false;
      const [memberships] = await connection.query<(RowDataPacket & { role_id: string })[]>(
        'SELECT role_id FROM user_roles WHERE user_id=? ORDER BY role_id FOR SHARE',
        [userId],
      );
      return memberships.some((membership) => eligibleRoleIds.has(String(membership.role_id)));
    });
  }
}

const lockConfiguration = async (
  connection: PoolConnection,
  sceneCode: UserCandidateSceneCode,
  payload: UpdateUserCandidateConfigRequest,
  actorId: string | null | undefined,
): Promise<{ id: string; version: number }> => {
  if (payload.version === null) {
    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO user_candidate_configs (scene_code,version,created_by,updated_by) VALUES (?,1,?,?)',
      [sceneCode, actorId ?? null, actorId ?? null],
    );
    return { id: String(result.insertId), version: 1 };
  }
  const [configs] = await connection.query<ConfigRow[]>(
    'SELECT id,scene_code,version,is_deleted FROM user_candidate_configs WHERE scene_code=? FOR UPDATE',
    [sceneCode],
  );
  const config = configs[0];
  if (!config || config.is_deleted !== 0 || config.version !== payload.version)
    throw configurationConflict();
  return { id: String(config.id), version: config.version };
};

const lockRole = async (
  connection: Queryable,
  roleId: string,
): Promise<RoleStateRow | undefined> => {
  const [roles] = await connection.query<RoleStateRow[]>(
    'SELECT id,status,deleted_at FROM roles WHERE id=? FOR SHARE',
    [roleId],
  );
  return roles[0];
};

const readConfigurations = async (
  connection: Queryable,
  sceneCode?: UserCandidateSceneCode,
): Promise<UserCandidateConfiguration[]> => {
  const [rows] = await connection.query<
    (RowDataPacket & {
      id: string;
      scene_code: UserCandidateSceneCode;
      version: number;
      role_id: string | null;
      role_name: string | null;
      role_code: string | null;
      candidate_count: number;
    })[]
  >(
    `SELECT c.id,c.scene_code,c.version,r.id role_id,r.name role_name,r.code role_code,
            (SELECT COUNT(DISTINCT ur.user_id)
               FROM user_candidate_config_roles count_cr
               JOIN roles count_r ON count_r.id=count_cr.role_id
                    AND count_r.status=? AND count_r.deleted_at IS NULL
               JOIN user_roles ur ON ur.role_id=count_r.id
               JOIN users u ON u.id=ur.user_id AND u.status=? AND u.deleted_at IS NULL
              WHERE count_cr.config_id=c.id) candidate_count
       FROM user_candidate_configs c
       LEFT JOIN user_candidate_config_roles cr ON cr.config_id=c.id
       LEFT JOIN roles r ON r.id=cr.role_id
      WHERE c.is_deleted=0 ${sceneCode === undefined ? '' : 'AND c.scene_code=?'}
      ORDER BY c.id,r.id`,
    sceneCode === undefined
      ? [SYSTEM_STATUS.enabled, SYSTEM_STATUS.enabled]
      : [SYSTEM_STATUS.enabled, SYSTEM_STATUS.enabled, sceneCode],
  );
  const configurations = new Map<string, UserCandidateConfiguration>();
  for (const row of rows) {
    const id = String(row.id);
    const config = configurations.get(id) ?? {
      id,
      sceneCode: row.scene_code,
      version: row.version,
      roles: [],
      candidateCount: Number(row.candidate_count),
    };
    if (row.role_id !== null && row.role_name !== null && row.role_code !== null)
      config.roles.push({ id: String(row.role_id), name: row.role_name, code: row.role_code });
    configurations.set(id, config);
  }
  return [...configurations.values()];
};

const compareNumericId = (a: string, b: string): number => {
  if (BigInt(a) < BigInt(b)) return -1;
  if (BigInt(a) > BigInt(b)) return 1;
  return 0;
};

const configurationConflict = (): ConcurrencyError =>
  new ConcurrencyError(
    CONCURRENCY_ERROR_CODES.concurrentModification,
    '业务人员配置已被其他请求修改，请刷新后重试',
  );

const databaseCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
