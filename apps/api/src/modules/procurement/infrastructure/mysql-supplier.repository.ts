import { Inject, Injectable } from '@nestjs/common';
import { PROCUREMENT_ERROR_CODES, SUPPLIER_OPTIONS_WINDOW_SIZE } from '@company/constants';
import type {
  CreateSupplierPayload,
  PageResult,
  SupplierItem,
  SupplierOption,
  SupplierOptionQuery,
  UpdateSupplierPayload,
} from '@company/contracts';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  SupplierRepository,
  type SupplierListFilter,
} from '../application/ports/supplier.repository.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';

type SupplierRow = RowDataPacket & {
  id: number;
  supplier_name: string;
  version: number;
  created_at: Date;
  updated_at: Date;
};
type SupplierOptionRow = RowDataPacket & { id: number; supplier_name: string };
const SUPPLIER_SELECT =
  'SELECT id,supplier_name,version,created_at,updated_at FROM procurement_supplier';

@Injectable()
export class MysqlSupplierRepository extends SupplierRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async list(query: SupplierListFilter): Promise<PageResult<SupplierItem>> {
    const where = `is_deleted=0${query.keyword ? ' AND supplier_name LIKE ?' : ''}`;
    const parameters = query.keyword ? [`%${query.keyword}%`] : [];
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM procurement_supplier WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<SupplierRow[]>(
      `${SUPPLIER_SELECT} WHERE ${where} ORDER BY supplier_name,id LIMIT ? OFFSET ?`,
      [...parameters, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return {
      items: rows.map(mapSupplier),
      total: Number(count?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async options(query: SupplierOptionQuery): Promise<SupplierOption[]> {
    const parameters: Array<string | number> = query.keyword ? [`%${query.keyword}%`] : [];
    const [window] = await this.pool.query<SupplierOptionRow[]>(
      `SELECT id,supplier_name FROM procurement_supplier
       WHERE is_deleted=0${query.keyword ? ' AND supplier_name LIKE ?' : ''}
       ORDER BY supplier_name,id LIMIT ?`,
      [...parameters, SUPPLIER_OPTIONS_WINDOW_SIZE],
    );
    const includeIds = query.includeIds ?? [];
    if (includeIds.length === 0) return window.map(mapOption);
    const [selected] = await this.pool.query<SupplierOptionRow[]>(
      `SELECT id,supplier_name FROM procurement_supplier
       WHERE is_deleted=0 AND id IN (${includeIds.map(() => '?').join(',')})
       ORDER BY supplier_name,id`,
      includeIds,
    );
    const options = new Map(window.map((row) => [String(row.id), mapOption(row)]));
    for (const row of selected) options.set(String(row.id), mapOption(row));
    return [...options.values()];
  }

  create(payload: CreateSupplierPayload, context: CommandContext): Promise<SupplierItem> {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO procurement_supplier (supplier_name,created_by,updated_by) VALUES (?,?,?)',
        [payload.supplierName, context.actorId, context.actorId],
      );
      const after = await readSupplier(connection, String(result.insertId));
      await auditSupplier(connection, context, 'supplier.create', null, after);
      return after;
    }).catch(mapWriteError);
  }

  update(
    id: string,
    payload: UpdateSupplierPayload,
    context: CommandContext,
  ): Promise<SupplierItem> {
    return withTransaction(this.pool, async (connection) => {
      const before = await readSupplier(connection, id, true);
      requireOptimisticUpdate(before.version === payload.version ? 1 : 0);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE procurement_supplier SET supplier_name=?,version=version+1,updated_by=?
         WHERE id=? AND version=? AND is_deleted=0`,
        [payload.supplierName, context.actorId, id, payload.version],
      );
      requireOptimisticUpdate(result.affectedRows);
      const after = await readSupplier(connection, id);
      await auditSupplier(connection, context, 'supplier.update', before, after);
      return after;
    }).catch(mapWriteError);
  }
}

const readSupplier = async (
  connection: PoolConnection,
  id: string,
  lock = false,
): Promise<SupplierItem> => {
  const [[row]] = await connection.query<SupplierRow[]>(
    `${SUPPLIER_SELECT} WHERE id=? AND is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!row) {
    throw new ProcurementDomainError(PROCUREMENT_ERROR_CODES.supplierNotFound, '供应商不存在');
  }
  return mapSupplier(row);
};

const mapSupplier = (row: SupplierRow): SupplierItem => ({
  id: String(row.id),
  supplierName: row.supplier_name,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});
const mapOption = (row: SupplierOptionRow): SupplierOption => ({
  id: String(row.id),
  supplierName: row.supplier_name,
});

const mapWriteError = (error: unknown): never => {
  if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') {
    throw new ProcurementDomainError(
      PROCUREMENT_ERROR_CODES.supplierNameTaken,
      '供应商名称已存在，删除后的名称也不能复用',
    );
  }
  throw error;
};

const auditSupplier = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  before: SupplierItem | null,
  after: SupplierItem,
): Promise<void> =>
  writeTransactionalAudit(connection, {
    logType: 'business',
    module: 'procurement',
    action,
    userId: context.actorId,
    targetType: 'procurement_supplier',
    targetId: after.id,
    result: 'success',
    beforeData: before,
    afterData: after,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });
