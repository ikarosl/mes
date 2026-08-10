import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { requireConfigurableProduct } from '../domain/product-configuration.policy.js';
import { mapProductWriteError } from './mysql-product.shared.js';

type Db = Pool | PoolConnection;
type EntityRow = RowDataPacket & { id: number; status?: number | string; is_deleted?: number };
import type {
  ProcessRouteListItem,
  ProcessRouteOption,
  ProcessRoutePayload,
  ProcessRouteQuery,
  ProcessRouteStatus,
  ProductItemKind,
  ProductListItem,
  PageResult,
} from '@company/contracts';
import { type ProcessRouteRepository } from '../application/ports/process-route.repository.js';

@Injectable()
export class MysqlProcessRouteRepository implements ProcessRouteRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listRoutes(query: ProcessRouteQuery): Promise<PageResult<ProcessRouteListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['r.is_deleted=0'];
    const parameters: string[] = [];
    if (query.keyword) {
      const keyword = `%${query.keyword}%`;
      conditions.push('(r.route_code LIKE ? OR r.route_name LIKE ?)');
      parameters.push(keyword, keyword);
    }
    if (query.status) {
      conditions.push('r.status=?');
      parameters.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[countRow]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM process_routes r WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        route_code: string;
        route_name: string;
        product_id: number;
        item_code: string;
        product_name: string;
        version_no: string;
        status: ProcessRouteStatus;
        process_summary: string | null;
        step_count: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(
      `SELECT r.id,r.route_code,r.route_name,r.product_id,p.item_code,p.product_name,r.version_no,r.status,
                    GROUP_CONCAT(CASE WHEN rs.is_deleted=0 THEN rs.step_name_snapshot END ORDER BY rs.step_order SEPARATOR ' → ') process_summary,
                    COUNT(CASE WHEN rs.is_deleted=0 THEN 1 END) step_count,r.remark,r.updated_at
             FROM process_routes r JOIN products p ON p.id=r.product_id
             LEFT JOIN process_route_steps rs ON rs.route_id=r.id
             WHERE ${where} GROUP BY r.id,p.item_code,p.product_name ORDER BY r.created_at DESC,r.id DESC
             LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const items = rows.map((row) => ({
      id: String(row.id),
      routeCode: row.route_code,
      routeName: row.route_name,
      productId: String(row.product_id),
      itemCode: row.item_code,
      productName: row.product_name,
      versionNo: row.version_no,
      status: row.status,
      processSummary: row.process_summary,
      stepCount: Number(row.step_count),
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
    return { items, total: Number(countRow?.total ?? 0), page, pageSize };
  }

  async listRouteOptions(): Promise<ProcessRouteOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        route_code: string;
        route_name: string;
        product_id: number;
        version_no: string;
        status: ProcessRouteStatus;
      })[]
    >(`SELECT id,route_code,route_name,product_id,version_no,status
       FROM process_routes WHERE is_deleted=0 AND status='enabled'
       ORDER BY route_code,version_no,id`);
    return rows.map((row) => ({
      id: String(row.id),
      routeCode: row.route_code,
      routeName: row.route_name,
      productId: String(row.product_id),
      versionNo: row.version_no,
      status: row.status,
    }));
  }

  async createRoute(payload: ProcessRoutePayload, audit: CommandContext) {
    return withTransaction(this.pool, async (connection) => {
      await this.requireRoutableProduct(connection, payload.productId);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO process_routes (route_code,route_name,product_id,version_no,status,remark,created_by,updated_by) VALUES (?,?,?,?,'draft',?,?,?)`,
        [
          payload.routeCode,
          payload.routeName,
          payload.productId,
          payload.versionNo,
          payload.remark ?? null,
          audit.actorId,
          audit.actorId,
        ],
      );
      await this.audit(connection, audit, 'route.create', String(result.insertId), null, {
        ...payload,
        status: 'draft',
      });
      return { id: String(result.insertId) };
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async updateRoute(id: string, payload: ProcessRoutePayload, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.routeRecord(connection, id, true);
      if (before.status !== 'draft')
        throw new ProductDomainError(
          'IMMUTABLE_ROUTE',
          '路线启用后版本内容不可原地修改，请创建新版本',
        );
      await this.requireRoutableProduct(connection, payload.productId);
      if (String(before.product_id) !== payload.productId) {
        const [[steps]] = await connection.query<(RowDataPacket & { count: number })[]>(
          'SELECT COUNT(*) count FROM process_route_steps WHERE route_id=? AND is_deleted=0',
          [id],
        );
        if ((steps?.count ?? 0) > 0)
          throw new ProductDomainError('INVALID_ROUTE', '已有步骤的草稿路线不能更换所属产品');
      }
      await connection.execute(
        `UPDATE process_routes SET route_code=?,route_name=?,product_id=?,version_no=?,remark=?,updated_by=? WHERE id=? AND is_deleted=0`,
        [
          payload.routeCode,
          payload.routeName,
          payload.productId,
          payload.versionNo,
          payload.remark ?? null,
          audit.actorId,
          id,
        ],
      );
      await this.audit(connection, audit, 'route.update', id, before, payload);
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async setRouteStatus(id: string, status: ProcessRouteStatus, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.routeRecord(connection, id, true);
      const current = before.status as ProcessRouteStatus;
      const allowed: Record<ProcessRouteStatus, ProcessRouteStatus[]> = {
        draft: ['enabled', 'archived'],
        enabled: ['disabled', 'archived'],
        disabled: ['enabled', 'archived'],
        archived: [],
      };
      if (status !== current && !allowed[current].includes(status)) {
        throw new ProductDomainError('INVALID_ROUTE', `工艺路线不能从 ${current} 变更为 ${status}`);
      }
      if (status !== 'enabled' && (await this.isDefaultRouteInUse(connection, id))) {
        throw new ProductDomainError(
          'DEFAULT_ROUTE_IN_USE',
          '作为产品默认路线的工艺路线不能停用或归档',
        );
      }
      if (status === 'enabled') {
        await this.requireRoutableProduct(connection, String(before.product_id));
        const [[steps]] = await connection.query<(RowDataPacket & { count: number })[]>(
          'SELECT COUNT(*) count FROM process_route_steps WHERE route_id=? AND is_deleted=0 AND status=1',
          [id],
        );
        if ((steps?.count ?? 0) === 0)
          throw new ProductDomainError(
            'ROUTE_STEPS_REQUIRED',
            '路线至少配置一个启用工序后才能启用',
          );
      }
      await connection.execute(
        'UPDATE process_routes SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.actorId, id],
      );
      await this.audit(connection, audit, 'route.status', id, { status: current }, { status });
    });
  }

  async deleteRoute(id: string, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.routeRecord(connection, id, true);
      if (before.status !== 'draft')
        throw new ProductDomainError('IMMUTABLE_ROUTE', '只有从未启用的草稿路线可以删除');
      await connection.execute(
        `DELETE rsm FROM route_step_materials rsm JOIN process_route_steps rs ON rs.id=rsm.route_step_id WHERE rs.route_id=?`,
        [id],
      );
      await connection.execute(
        'UPDATE process_route_steps SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE route_id=? AND is_deleted=0',
        [audit.actorId, audit.actorId, id],
      );
      await connection.execute(
        'UPDATE process_routes SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE id=? AND is_deleted=0',
        [audit.actorId, audit.actorId, id],
      );
      await this.audit(connection, audit, 'route.delete', id, before, null);
    });
  }

  private async productRecord(db: Db, id: string, lock = false) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        item_code: string;
        product_name: string;
        category_id: number;
        item_kind: ProductItemKind;
        acquire_method: ProductListItem['acquireMethod'];
        status: number;
        default_route_id: number | null;
      })[]
    >(
      `SELECT p.id,p.item_code,p.product_name,p.category_id,c.item_kind,p.acquire_method,p.status,p.default_route_id
           FROM products p JOIN product_categories c ON c.id=p.category_id WHERE p.id=? AND p.is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '产品或物料不存在');
    return row;
  }
  private async requireRoutableProduct(db: Db, id: string) {
    const product = await this.productRecord(db, id);
    requireConfigurableProduct({
      status: product.status,
      acquireMethod: product.acquire_method,
      itemKind: product.item_kind,
    });
    if (
      product.status !== 1 ||
      product.acquire_method !== 'self_made' ||
      product.item_kind === 'material'
    ) {
      throw new ProductDomainError(
        'INVALID_PRODUCT_KIND',
        '工艺路线只能绑定已启用的自制半成品或成品',
      );
    }
    return product;
  }

  private async routeRecord(db: Db, id: string, lock = false) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        route_code: string;
        route_name: string;
        product_id: number;
        version_no: string;
        status: ProcessRouteStatus;
      })[]
    >(
      `SELECT id,route_code,route_name,product_id,version_no,status FROM process_routes WHERE id=? AND is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '工艺路线不存在');
    return row;
  }
  private async isDefaultRouteInUse(db: Db, routeId: string): Promise<boolean> {
    const [[product]] = await db.query<EntityRow[]>(
      'SELECT id FROM products WHERE default_route_id=? AND is_deleted=0 LIMIT 1 FOR UPDATE',
      [routeId],
    );
    return Boolean(product);
  }
  private async audit(
    db: Db,
    audit: CommandContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    await writeTransactionalAudit(db, {
      logType: 'business',
      module: 'product',
      action,
      userId: audit.actorId,
      targetId,
      targetType: 'product-master-data',
      result: 'success',
      beforeData,
      afterData,
      ip: audit.ip,
      requestId: audit.requestId,
      userAgent: audit.userAgent,
    });
  }
  private date(value: Date | null) {
    return value ? toBeijingISOString(value) : null;
  }
}
