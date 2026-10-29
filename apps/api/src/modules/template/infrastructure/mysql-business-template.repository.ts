import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_TEMPLATE_STATUSES } from '@company/constants';
import type {
  BusinessTemplateItem,
  BusinessTemplatePayload,
  JsonTableData,
  PageResult,
  UpdateBusinessTemplatePayload,
} from '@company/contracts';
import { withActiveConnection, withTransaction } from '@company/database';
import { normalizeJsonTable } from '@company/utils';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  BusinessTemplateRepository,
  type BusinessTemplatePageQuery,
} from '../application/ports/business-template.repository.js';
import { TemplateDomainError } from '../domain/template.errors.js';

interface TemplateRow extends RowDataPacket {
  id: string;
  name: string;
  content: unknown;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const TEMPLATE_COLUMNS = 'CAST(id AS CHAR) id,name,content,status,version,created_at,updated_at';

@Injectable()
export class MysqlBusinessTemplateRepository extends BusinessTemplateRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  list(query: BusinessTemplatePageQuery): Promise<PageResult<BusinessTemplateItem>> {
    const conditions = ['is_deleted=0'];
    const parameters: Array<string | number> = [];
    if (query.status !== undefined) {
      conditions.push('status=?');
      parameters.push(query.status);
    }
    if (query.keyword) {
      conditions.push("name LIKE ? ESCAPE '!'");
      parameters.push(`%${query.keyword.replace(/[!%_]/g, (character) => `!${character}`)}%`);
    }
    const where = conditions.join(' AND ');
    return withActiveConnection(this.pool, async (connection) => {
      const [[count]] = await connection.query<(RowDataPacket & { total: number | string })[]>(
        `SELECT COUNT(*) total FROM business_templates WHERE ${where}`,
        parameters,
      );
      const [rows] = await connection.query<TemplateRow[]>(
        `SELECT ${TEMPLATE_COLUMNS} FROM business_templates WHERE ${where}
         ORDER BY name,id LIMIT ? OFFSET ?`,
        [...parameters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        items: rows.map(toItem),
        total: Number(count?.total ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  getById(id: string): Promise<BusinessTemplateItem | null> {
    return withActiveConnection(this.pool, (connection) => readTemplate(connection, id));
  }

  async create(
    payload: BusinessTemplatePayload,
    context: CommandContext,
  ): Promise<BusinessTemplateItem> {
    try {
      return await withTransaction(this.pool, async (connection) => {
        await connection.execute(
          `INSERT INTO business_templates
             (name,content,status,created_by,updated_by)
           VALUES (?,?,?,?,?)`,
          [
            payload.name,
            JSON.stringify(payload.content),
            payload.status,
            context.actorId,
            context.actorId,
          ],
        );
        const [[inserted]] = await connection.query<(RowDataPacket & { id: string })[]>(
          'SELECT CAST(LAST_INSERT_ID() AS CHAR) id',
        );
        if (!inserted) throw new Error('业务模板创建结果不存在');
        const saved = await requireSavedTemplate(connection, inserted.id);
        await writeAudit(connection, context, '创建业务模板', saved, null);
        return saved;
      });
    } catch (error) {
      throw mapWriteError(error);
    }
  }

  async update(
    id: string,
    payload: UpdateBusinessTemplatePayload,
    context: CommandContext,
  ): Promise<BusinessTemplateItem> {
    try {
      return await withTransaction(this.pool, async (connection) => {
        const current = await readTemplate(connection, id, true);
        if (!current) throw new TemplateDomainError('NOT_FOUND', '业务模板不存在或已删除');
        if (current.version !== payload.version) requireOptimisticUpdate(0);
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE business_templates
              SET name=?,content=?,status=?,version=version+1,updated_by=?
            WHERE id=? AND version=? AND is_deleted=0`,
          [
            payload.name ?? current.name,
            JSON.stringify(payload.content ?? current.content),
            payload.status ?? current.status,
            context.actorId,
            id,
            payload.version,
          ],
        );
        requireOptimisticUpdate(result.affectedRows);
        const saved = await requireSavedTemplate(connection, id);
        await writeAudit(connection, context, '修改业务模板', saved, current);
        return saved;
      });
    } catch (error) {
      throw mapWriteError(error);
    }
  }
}

const readTemplate = async (
  connection: Pick<PoolConnection, 'query'>,
  id: string,
  forUpdate = false,
): Promise<BusinessTemplateItem | null> => {
  const [[row]] = await connection.query<TemplateRow[]>(
    `SELECT ${TEMPLATE_COLUMNS} FROM business_templates WHERE id=? AND is_deleted=0${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return row ? toItem(row) : null;
};

const requireSavedTemplate = async (
  connection: PoolConnection,
  id: string,
): Promise<BusinessTemplateItem> => {
  const saved = await readTemplate(connection, id);
  if (!saved) throw new Error('保存后的业务模板不存在');
  return saved;
};

const toItem = (row: TemplateRow): BusinessTemplateItem => {
  const status = BUSINESS_TEMPLATE_STATUSES.find((code) => code === row.status);
  if (!status) throw new Error('已保存的业务模板状态无效');
  return {
    id: row.id,
    name: row.name,
    content: readContent(row.content),
    status,
    version: row.version,
    createdAt: toBeijingISOString(row.created_at),
    updatedAt: toBeijingISOString(row.updated_at),
  };
};

const readContent = (value: unknown): JsonTableData => {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  const content = normalizeJsonTable(parsed);
  if (content.columns.length === 0) throw new Error('已保存的业务模板内容缺少列定义');
  return content;
};

const writeAudit = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  saved: BusinessTemplateItem,
  before: BusinessTemplateItem | null,
): Promise<void> =>
  writeTransactionalAudit(connection, {
    logType: 'operation',
    module: 'template',
    action,
    userId: context.actorId,
    targetId: saved.id,
    targetType: 'business_template',
    result: 'success',
    beforeData: before,
    afterData: saved,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });

const mapWriteError = (error: unknown): unknown => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  )
    return new TemplateDomainError('CONFLICT', '已有同名模板，请使用其他名称');
  return error;
};
