import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  OperationLogListItem,
  OperationLogQuery,
  OperationResult,
  PageResult,
} from '@company/contracts';
import type { AuditLogEntry } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { type AuditRepository } from '../application/ports/audit.repository.js';

@Injectable()
export class MysqlAuditRepository implements AuditRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listLogs(query: OperationLogQuery): Promise<PageResult<OperationLogListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      conditions.push(sql);
      parameters.push(value);
    };
    if (query.keyword) {
      conditions.push('(ol.action LIKE ? OR ol.remark LIKE ? OR u.username LIKE ?)');
      const keyword = `%${query.keyword}%`;
      parameters.push(keyword, keyword, keyword);
    }
    if (query.logType) add('ol.log_type=?', query.logType);
    if (query.module) add('ol.module=?', query.module);
    if (query.result) add('ol.result=?', query.result);
    if (query.userId) add('ol.user_id=?', query.userId);
    if (query.targetType) add('ol.target_type=?', query.targetType);
    if (query.targetId) add('ol.target_id=?', query.targetId);
    if (query.createdAtFrom) add('ol.created_at>=?', new Date(query.createdAtFrom));
    if (query.createdAtTo) add('ol.created_at<=?', new Date(query.createdAtTo));
    if (query.requestId) add('ol.request_id=?', query.requestId);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM operation_logs ol LEFT JOIN users u ON u.id=ol.user_id ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<(RowDataPacket & OperationLogRow)[]>(
      `SELECT ol.id,ol.log_type,ol.module,ol.action,ol.user_id,u.username,ol.target_id,
              ol.target_type,ol.result,ol.before_data,ol.after_data,ol.ip,ol.request_id,ol.http_method,
              ol.route,ol.http_status,ol.duration_ms,ol.user_agent,ol.error_code,ol.remark,ol.created_at
       FROM operation_logs ol LEFT JOIN users u ON u.id=ol.user_id
       ${where} ORDER BY ol.id DESC LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map(mapOperationLog),
      total: countRows[0]?.total ?? 0,
      page,
      pageSize,
    };
  }

  async writeLog(entry: AuditLogEntry): Promise<void> {
    await writeTransactionalAudit(this.pool, entry);
  }
}

type OperationLogRow = {
  id: number;
  log_type: string;
  module: string;
  action: string;
  user_id: number | null;
  username: string | null;
  target_id: number | null;
  target_type: string | null;
  result: OperationResult;
  before_data: unknown;
  after_data: unknown;
  ip: string | null;
  request_id: string | null;
  http_method: string | null;
  route: string | null;
  http_status: number | null;
  duration_ms: number | null;
  user_agent: string | null;
  error_code: string | null;
  remark: string | null;
  created_at: Date;
};

const mapOperationLog = (row: OperationLogRow): OperationLogListItem => ({
  id: String(row.id),
  logType: row.log_type,
  module: row.module,
  action: row.action,
  userId: row.user_id === null ? null : String(row.user_id),
  username: row.username,
  targetId: row.target_id === null ? null : String(row.target_id),
  targetType: row.target_type,
  targetIds: null,
  businessKey: null,
  result: row.result,
  requestId: row.request_id,
  httpMethod: row.http_method,
  route: row.route,
  httpStatus: row.http_status,
  durationMs: row.duration_ms,
  requestData: null,
  beforeData: parseJson(row.before_data),
  afterData: parseJson(row.after_data),
  ip: row.ip,
  userAgent: row.user_agent,
  errorCode: row.error_code,
  remark: row.remark,
  createdAt: toBeijingISOString(row.created_at),
});

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};
