import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_TEMPLATE_SCENES,
  BUSINESS_TEMPLATE_STATUSES,
  BUSINESS_TEMPLATE_STATUS,
} from '@company/constants';
import type {
  BusinessTemplateDefaultItem,
  BusinessTemplateItem,
  BusinessTemplatePayload,
  BusinessTemplateSceneCode,
  JsonTableData,
  PageResult,
  UpdateBusinessTemplateDefaultPayload,
  UpdateBusinessTemplatePayload,
} from '@company/contracts';
import { withActiveConnection, withTransaction } from '@company/database';
import {
  normalizeBusinessTemplateColumnRules,
  normalizeJsonTable,
  validateTemplateTableInput,
} from '@company/utils';
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
import type { BusinessTemplateSubmission } from '../application/ports/business-template-scene.query.js';
import { TemplateCommandError } from '../template-command.error.js';

interface TemplateRow extends RowDataPacket {
  id: string;
  name: string;
  content: unknown;
  column_rules: unknown;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface DefaultLockRow extends RowDataPacket {
  id: string;
  scene_code: string;
  template_id: string | null;
  version: number;
}

interface DefaultRow extends RowDataPacket {
  default_id: string;
  scene_code: string;
  template_id: string | null;
  default_version: number;
  id: string | null;
  name: string | null;
  content: unknown;
  column_rules: unknown;
  status: string | null;
  version: number | null;
  created_at: Date | null;
  updated_at: Date | null;
}

const TEMPLATE_COLUMNS =
  'CAST(id AS CHAR) id,name,content,column_rules,status,version,created_at,updated_at';

const DEFAULT_SELECT = `SELECT CAST(d.id AS CHAR) default_id,d.scene_code,
  CAST(d.template_id AS CHAR) template_id,d.version default_version,
  CAST(t.id AS CHAR) id,t.name,t.content,t.column_rules,t.status,t.version,t.created_at,t.updated_at
  FROM business_template_defaults d
  LEFT JOIN business_templates t ON t.id=d.template_id AND t.is_deleted=0
  WHERE d.is_deleted=0`;

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
             (name,content,column_rules,status,created_by,updated_by)
           VALUES (?,?,?,?,?,?)`,
          [
            payload.name,
            JSON.stringify(payload.content),
            payload.columnRules == null ? null : JSON.stringify(payload.columnRules),
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
        const bindings = await lockDefaults(connection);
        const current = await readTemplate(connection, id, true);
        if (!current) throw new TemplateCommandError('NOT_FOUND', '业务模板不存在或已删除');
        if (current.version !== payload.version) requireOptimisticUpdate(0);
        const content = payload.content ?? current.content;
        const columnRules = normalizeRules(
          payload.columnRules === undefined ? current.columnRules : payload.columnRules,
          content,
        );
        const status = payload.status ?? current.status;
        if (
          bindings.some((binding) => binding.template_id === id) &&
          (status !== BUSINESS_TEMPLATE_STATUS.enabled || columnRules === null)
        )
          throw new TemplateCommandError(
            'CONFLICT',
            '该模板已用作业务默认模板，请先更换默认模板，再停用或清空填写规则',
          );
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE business_templates
              SET name=?,content=?,column_rules=?,status=?,version=version+1,updated_by=?
            WHERE id=? AND version=? AND is_deleted=0`,
          [
            payload.name ?? current.name,
            JSON.stringify(content),
            columnRules === null ? null : JSON.stringify(columnRules),
            status,
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

  listDefaults(): Promise<BusinessTemplateDefaultItem[]> {
    return withActiveConnection(this.pool, async (connection) => {
      const [rows] = await connection.query<DefaultRow[]>(
        `${DEFAULT_SELECT} ORDER BY d.scene_code`,
      );
      return rows.map(toDefault);
    });
  }

  getDefault(sceneCode: BusinessTemplateSceneCode): Promise<BusinessTemplateDefaultItem> {
    requireScene(sceneCode);
    return withActiveConnection(this.pool, async (connection) => {
      const [[row]] = await connection.query<DefaultRow[]>(`${DEFAULT_SELECT} AND d.scene_code=?`, [
        sceneCode,
      ]);
      if (!row) throw new TemplateCommandError('NOT_FOUND', '业务默认模板场景尚未初始化');
      return toDefault(row);
    });
  }

  async updateDefault(
    sceneCode: BusinessTemplateSceneCode,
    payload: UpdateBusinessTemplateDefaultPayload,
    context: CommandContext,
  ): Promise<BusinessTemplateDefaultItem> {
    requireScene(sceneCode);
    return withTransaction(this.pool, async (connection) => {
      const bindings = await lockDefaults(connection);
      const current = bindings.find((binding) => binding.scene_code === sceneCode);
      if (!current) throw new TemplateCommandError('NOT_FOUND', '业务默认模板场景尚未初始化');
      if (current.version !== payload.version) requireOptimisticUpdate(0);
      const template = await readTemplate(connection, payload.templateId, true);
      requireDefaultTemplate(template);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE business_template_defaults
            SET template_id=?,version=version+1,updated_by=?
          WHERE id=? AND version=? AND is_deleted=0`,
        [payload.templateId, context.actorId, current.id, payload.version],
      );
      requireOptimisticUpdate(result.affectedRows);
      const saved: BusinessTemplateDefaultItem = {
        id: current.id,
        sceneCode,
        templateId: template.id,
        version: current.version + 1,
        template,
      };
      await writeTransactionalAudit(connection, {
        logType: 'operation',
        module: 'template',
        action: '设置业务默认模板',
        userId: context.actorId,
        targetId: current.id,
        targetType: 'business_template_default',
        result: 'success',
        beforeData: {
          sceneCode,
          templateId: current.template_id,
          version: current.version,
        },
        afterData: {
          sceneCode,
          templateId: saved.templateId,
          version: saved.version,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return saved;
    });
  }

  validateSubmission(
    sceneCode: BusinessTemplateSceneCode,
    input: BusinessTemplateSubmission,
  ): Promise<JsonTableData> {
    requireScene(sceneCode);
    return withActiveConnection(this.pool, async (connection) => {
      if (connection === this.pool || !('release' in connection))
        throw new Error('业务模板填写校验必须位于同一连接池的活动事务内');
      const bindings = await lockDefaults(connection);
      const binding = bindings.find((candidate) => candidate.scene_code === sceneCode);
      if (!binding?.template_id)
        throw new TemplateCommandError('NOT_FOUND', '业务默认模板尚未配置，请联系管理员');
      if (binding.template_id !== input.templateId)
        throw new TemplateCommandError('CONFLICT', '业务默认模板已变更，请重新加载模板后填写');
      const template = await readTemplate(connection, binding.template_id, true);
      requireDefaultTemplate(template);
      if (template.version !== input.templateVersion)
        throw new TemplateCommandError('CONFLICT', '模板已被修改，请重新加载模板后填写');
      try {
        return validateTemplateTableInput(template.content, template.columnRules, input.content);
      } catch (error) {
        if (error instanceof Error)
          throw new TemplateCommandError('VALIDATION_ERROR', error.message);
        throw error;
      }
    });
  }
}

/** 管理绑定、编辑模板及业务提交统一先锁场景，再锁模板。 */
const lockDefaults = async (connection: PoolConnection): Promise<DefaultLockRow[]> => {
  const [rows] = await connection.query<DefaultLockRow[]>(
    `SELECT CAST(id AS CHAR) id,scene_code,CAST(template_id AS CHAR) template_id,version
       FROM business_template_defaults WHERE is_deleted=0 ORDER BY scene_code FOR UPDATE`,
  );
  return rows;
};

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
  const saved = await readTemplate(connection, id, true);
  if (!saved) throw new Error('保存后的业务模板不存在');
  return saved;
};

const toItem = (row: TemplateRow | DefaultRow): BusinessTemplateItem => {
  if (
    row.id === null ||
    row.name === null ||
    row.version === null ||
    row.created_at === null ||
    row.updated_at === null
  )
    throw new Error('已保存的业务模板字段不完整');
  const status = BUSINESS_TEMPLATE_STATUSES.find((code) => code === row.status);
  if (!status) throw new Error('已保存的业务模板状态无效');
  const content = readContent(row.content);
  return {
    id: row.id,
    name: row.name,
    content,
    columnRules: normalizeBusinessTemplateColumnRules(parseJson(row.column_rules), content),
    status,
    version: row.version,
    createdAt: toBeijingISOString(row.created_at),
    updatedAt: toBeijingISOString(row.updated_at),
  };
};

const toDefault = (row: DefaultRow): BusinessTemplateDefaultItem => {
  const sceneCode = BUSINESS_TEMPLATE_SCENES.find((scene) => scene === row.scene_code);
  if (!sceneCode) throw new Error('已保存的业务默认模板场景无效');
  return {
    id: row.default_id,
    sceneCode,
    templateId: row.template_id,
    version: row.default_version,
    template: row.id === null ? null : toItem(row),
  };
};

const parseJson = (value: unknown): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;

const readContent = (value: unknown): JsonTableData => {
  const content = normalizeJsonTable(parseJson(value));
  if (content.columns.length === 0) throw new Error('已保存的业务模板内容缺少列定义');
  return content;
};

const normalizeRules = (
  value: unknown,
  content: JsonTableData,
): BusinessTemplateItem['columnRules'] => {
  try {
    return normalizeBusinessTemplateColumnRules(value, content);
  } catch (error) {
    if (error instanceof Error) throw new TemplateCommandError('VALIDATION_ERROR', error.message);
    throw error;
  }
};

const requireScene = (sceneCode: BusinessTemplateSceneCode): void => {
  if (!BUSINESS_TEMPLATE_SCENES.some((scene) => scene === sceneCode))
    throw new TemplateCommandError('VALIDATION_ERROR', '业务模板场景无效');
};

function requireDefaultTemplate(
  template: BusinessTemplateItem | null,
): asserts template is BusinessTemplateItem {
  if (
    !template ||
    template.status !== BUSINESS_TEMPLATE_STATUS.enabled ||
    !template.columnRules ||
    template.content.rows.length === 0
  )
    throw new TemplateCommandError(
      'VALIDATION_ERROR',
      '默认模板须为已启用、已设置填写规则且至少有一行的模板',
    );
}

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
    return new TemplateCommandError('CONFLICT', '已有同名模板，请使用其他名称');
  return error;
};
