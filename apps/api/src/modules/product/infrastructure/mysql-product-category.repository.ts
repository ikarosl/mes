import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { AuditContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import type {
  ProductCategoryListItem,
  ProductCategoryOption,
  ProductCategoryPayload,
  ProductCategoryQuery,
  ProductItemKind,
  PageResult,
} from '@company/contracts';
import { type ProductCategoryRepository } from '../application/ports/product-category.repository.js';
import { mapProductWriteError } from './mysql-product.shared.js';

type Db = Pool | PoolConnection;

@Injectable()
export class MysqlProductCategoryRepository implements ProductCategoryRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listCategories(query: ProductCategoryQuery): Promise<PageResult<ProductCategoryListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['is_deleted=0'];
    const parameters: Array<string | number> = [];
    if (query.categoryCode) {
      conditions.push('category_code LIKE ?');
      parameters.push(`%${query.categoryCode}%`);
    }
    if (query.categoryName) {
      conditions.push('category_name LIKE ?');
      parameters.push(`%${query.categoryName}%`);
    }
    if (query.status !== undefined) {
      conditions.push('status=?');
      parameters.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[countRow]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM product_categories WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        parent_id: number | null;
        category_code: string;
        category_name: string;
        item_kind: ProductItemKind;
        status: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(
      `SELECT id,parent_id,category_code,category_name,item_kind,status,remark,updated_at
         FROM product_categories WHERE ${where}
         ORDER BY item_kind,category_code,id LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const items = rows.map((row) => ({
      id: String(row.id),
      parentId: row.parent_id === null ? null : String(row.parent_id),
      categoryCode: row.category_code,
      categoryName: row.category_name,
      itemKind: row.item_kind,
      status: row.status,
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
    return { items, total: Number(countRow?.total ?? 0), page, pageSize };
  }

  async listCategoryOptions(): Promise<ProductCategoryOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        category_code: string;
        category_name: string;
        item_kind: ProductItemKind;
      })[]
    >(`SELECT id,category_code,category_name,item_kind
         FROM product_categories WHERE is_deleted=0 AND status=1
         ORDER BY item_kind,category_code,id`);
    return rows.map((row) => ({
      id: String(row.id),
      categoryCode: row.category_code,
      categoryName: row.category_name,
      itemKind: row.item_kind,
    }));
  }

  async createCategory(payload: ProductCategoryPayload, audit: AuditContext) {
    return withTransaction(this.pool, async (connection) => {
      await this.validateCategoryParent(connection, payload.parentId ?? null, payload.itemKind);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO product_categories (parent_id,category_code,category_name,item_kind,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          payload.parentId ?? null,
          payload.categoryCode,
          payload.categoryName,
          payload.itemKind,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          audit.userId,
        ],
      );
      await this.audit(
        connection,
        audit,
        'category.create',
        String(result.insertId),
        null,
        payload,
      );
      return { id: String(result.insertId) };
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async updateCategory(id: string, payload: ProductCategoryPayload, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.categoryRecord(connection, id);
      if (payload.parentId === id)
        throw new ProductDomainError('INVALID_CATEGORY', '分类不能将自身设为父分类');
      await this.validateCategoryParent(connection, payload.parentId ?? null, payload.itemKind);
      if (payload.parentId) {
        const [cycle] = await connection.query<RowDataPacket[]>(
          `WITH RECURSIVE ancestors AS (
             SELECT id,parent_id FROM product_categories WHERE id=? AND is_deleted=0
             UNION ALL
             SELECT pc.id,pc.parent_id FROM product_categories pc JOIN ancestors a ON pc.id=a.parent_id WHERE pc.is_deleted=0
           ) SELECT id FROM ancestors WHERE id=? LIMIT 1`,
          [payload.parentId, id],
        );
        if (cycle.length)
          throw new ProductDomainError(
            'INVALID_CATEGORY',
            '父分类不能指向当前分类的下级，避免形成循环',
          );
      }
      const [[usage]] = await connection.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM products WHERE category_id=? AND is_deleted=0',
        [id],
      );
      if ((usage?.count ?? 0) > 0 && before.item_kind !== payload.itemKind) {
        throw new ProductDomainError('INVALID_CATEGORY', '已被产品使用的分类不能修改对象类型');
      }
      await connection.execute(
        `UPDATE product_categories SET parent_id=?,category_code=?,category_name=?,item_kind=?,status=?,remark=?,updated_by=? WHERE id=? AND is_deleted=0`,
        [
          payload.parentId ?? null,
          payload.categoryCode,
          payload.categoryName,
          payload.itemKind,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          id,
        ],
      );
      await this.audit(connection, audit, 'category.update', id, before, payload);
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async setCategoryStatus(id: string, status: number, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.categoryRecord(connection, id);
      await connection.execute(
        'UPDATE product_categories SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.userId, id],
      );
      await this.audit(
        connection,
        audit,
        'category.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }

  private async categoryRecord(db: Db, id: string) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        item_kind: ProductItemKind;
        status: number;
        category_code: string;
        category_name: string;
      })[]
    >(
      'SELECT id,item_kind,status,category_code,category_name FROM product_categories WHERE id=? AND is_deleted=0',
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '产品分类不存在');
    return row;
  }
  private async requireCategory(db: Db, id: string) {
    const row = await this.categoryRecord(db, id);
    if (row.status !== 1)
      throw new ProductDomainError('INVALID_CATEGORY', '只能选择已启用的产品分类');
    return row;
  }
  private async validateCategoryParent(db: Db, parentId: string | null, itemKind: ProductItemKind) {
    if (!parentId) return;
    const parent = await this.requireCategory(db, parentId);
    if (parent.item_kind !== itemKind)
      throw new ProductDomainError('INVALID_CATEGORY', '父子分类必须属于相同对象类型');
  }
  private async audit(
    db: Db,
    audit: AuditContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    await writeTransactionalAudit(db, {
      logType: 'business',
      module: 'product',
      action,
      userId: audit.userId,
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
