import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DatabaseError, withActiveConnection, withTransaction } from '@company/database';
import type {
  PageResult,
  PersonnelGroup,
  PersonnelItem,
  PersonnelListQuery,
  PersonnelOption,
  PersonnelStatus,
  SavePersonnelInput,
  UpdatePersonnelInput,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type { AuditLogEntry } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { PersonnelRepository } from '../application/ports/personnel.repository.js';
import { PersonnelError } from '../domain/personnel.errors.js';

type PersonnelRow = RowDataPacket & {
  id: string;
  code: string;
  name: string;
  personnel_group: PersonnelGroup;
  status: PersonnelStatus;
  version: number;
};
const columns = 'id,code,name,personnel_group,status,version';
const item = (row: PersonnelRow): PersonnelItem => ({
  id: String(row.id),
  code: row.code,
  name: row.name,
  group: row.personnel_group,
  status: row.status,
  version: row.version,
});
const option = (row: PersonnelRow): PersonnelOption => ({
  id: String(row.id),
  code: row.code,
  name: row.name,
  group: row.personnel_group,
});

@Injectable()
export class MysqlPersonnelRepository extends PersonnelRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async list(
    query: PersonnelListQuery & { page: number; pageSize: number },
  ): Promise<PageResult<PersonnelItem>> {
    const where = ['is_deleted=0'];
    const values: Array<string | number> = [];
    if (query.keyword) {
      where.push('(code LIKE ? OR name LIKE ?)');
      values.push(`%${query.keyword}%`, `%${query.keyword}%`);
    }
    if (query.group) {
      where.push('personnel_group=?');
      values.push(query.group);
    }
    if (query.status) {
      where.push('status=?');
      values.push(query.status);
    }
    return withActiveConnection(this.pool, async (db) => {
      const [counts] = await db.query<(RowDataPacket & { total: string })[]>(
        `SELECT COUNT(*) total FROM personnel WHERE ${where.join(' AND ')}`,
        values,
      );
      const [rows] = await db.query<PersonnelRow[]>(
        `SELECT ${columns} FROM personnel WHERE ${where.join(' AND ')} ORDER BY code,id LIMIT ? OFFSET ?`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        items: rows.map(item),
        total: Number(counts[0]?.total ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }
  options(group?: PersonnelGroup): Promise<PersonnelOption[]> {
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<PersonnelRow[]>(
        `SELECT ${columns} FROM personnel WHERE is_deleted=0 AND status='active' ${group ? 'AND personnel_group=?' : ''} ORDER BY name,id`,
        group ? [group] : [],
      );
      return rows.map(option);
    });
  }
  requireActive(id: string, group?: PersonnelGroup): Promise<PersonnelOption> {
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool) throw new Error('现场人员资格复核必须位于业务事务中');
      const [rows] = await db.query<PersonnelRow[]>(
        `SELECT ${columns} FROM personnel WHERE id=? AND is_deleted=0 FOR SHARE`,
        [id],
      );
      const row = rows[0];
      if (!row || row.status !== 'active' || (group && row.personnel_group !== group))
        throw new PersonnelError(
          'INVALID_INPUT',
          group === 'quality' ? '请选择当前启用的质检人员' : '登记人员已停用或不存在，请重新选择',
        );
      return option(row);
    });
  }
  async create(input: SavePersonnelInput, audit: AuditLogEntry): Promise<PersonnelItem> {
    try {
      return await withTransaction(this.pool, async (db) => {
        const [created] = await db.execute<ResultSetHeader>(
          'INSERT INTO personnel(code,name,personnel_group,status,created_by,updated_by) VALUES (?,?,?,?,?,?)',
          [
            input.code,
            input.name,
            input.group,
            input.status,
            audit.userId ?? null,
            audit.userId ?? null,
          ],
        );
        const saved = await this.read(db, String(created.insertId));
        await writeTransactionalAudit(db, {
          ...audit,
          targetId: saved.id,
          beforeData: null,
          afterData: saved,
        });
        return saved;
      });
    } catch (error) {
      return this.mapDuplicate(error);
    }
  }
  async update(
    id: string,
    input: UpdatePersonnelInput,
    audit: AuditLogEntry,
  ): Promise<PersonnelItem> {
    try {
      return await withTransaction(this.pool, async (db) => {
        const before = await this.read(db, id, true);
        if (before.code !== input.code)
          throw new PersonnelError('INVALID_INPUT', '人员编号创建后不能修改');
        const [updated] = await db.execute<ResultSetHeader>(
          'UPDATE personnel SET name=?,personnel_group=?,status=?,version=version+1,updated_by=? WHERE id=? AND version=? AND is_deleted=0',
          [input.name, input.group, input.status, audit.userId ?? null, id, input.version],
        );
        requireOptimisticUpdate(updated.affectedRows);
        const saved = await this.read(db, id);
        await writeTransactionalAudit(db, {
          ...audit,
          targetId: id,
          beforeData: before,
          afterData: saved,
        });
        return saved;
      });
    } catch (error) {
      return this.mapDuplicate(error);
    }
  }
  private async read(db: PoolConnection, id: string, lock = false): Promise<PersonnelItem> {
    const [rows] = await db.query<PersonnelRow[]>(
      `SELECT ${columns} FROM personnel WHERE id=? AND is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!rows[0]) throw new PersonnelError('NOT_FOUND', '现场人员不存在');
    return item(rows[0]);
  }
  private mapDuplicate(error: unknown): never {
    const cause = error instanceof DatabaseError ? error.cause : error;
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === 'ER_DUP_ENTRY'
    )
      throw new PersonnelError('CONFLICT', '人员编号已存在');
    throw error;
  }
}
