import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { ProductPayload } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { mapProductWriteError } from './mysql-product.shared.js';
import {
  readProductCatalogRecord,
  requireProductCatalogCategory,
  writeProductCatalogAudit,
} from './mysql-product-catalog.persistence.js';

/** 成品主数据写入及成功审计在同一事务中提交。 */
export class MysqlProductCommands {
  constructor(private readonly pool: Pool) {}

  async createProduct(payload: ProductPayload, audit: CommandContext): Promise<{ id: string }> {
    return withTransaction(this.pool, async (connection) => {
      await requireProductCatalogCategory(connection, payload.categoryId);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO products (item_code,product_name,category_id,unit,acquire_method,spec_values,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          payload.itemCode,
          payload.productName,
          payload.categoryId,
          payload.unit,
          payload.acquireMethod,
          JSON.stringify(payload.specValues ?? []),
          payload.status,
          payload.remark ?? null,
          audit.actorId,
          audit.actorId,
        ],
      );
      await writeProductCatalogAudit(
        connection,
        audit,
        'product.create',
        String(result.insertId),
        null,
        payload,
      );
      return { id: String(result.insertId) };
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async updateProduct(id: string, payload: ProductPayload, audit: CommandContext): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const before = await readProductCatalogRecord(connection, id, true);
      if (before.bom_status === 'pending_approval') {
        throw new ProductDomainError('CONFLICT', 'BOM 审批中，产品资料暂时不能修改');
      }
      if (payload.itemCode !== before.item_code) {
        throw new ProductDomainError(
          'CONFLICT',
          '物料/产品编码创建后不可修改；原则变化请新建产品和编码',
        );
      }
      if (payload.unit !== before.unit) {
        throw new ProductDomainError(
          'CONFLICT',
          '物料/产品基础单位创建后不可修改；原则变化请新建产品和编码',
        );
      }
      if (
        before.bom_locked_at !== null &&
        (payload.categoryId !== String(before.category_id) ||
          payload.acquireMethod !== before.acquire_method)
      ) {
        throw new ProductDomainError(
          'CONFLICT',
          'BOM 锁定后不能修改产品分类或获取方式；原则变化请新建产品',
        );
      }
      await requireProductCatalogCategory(connection, payload.categoryId);
      if (payload.acquireMethod !== 'self_made') {
        const [[dependent]] = await connection.query<(RowDataPacket & { bom_count: number })[]>(
          `SELECT (SELECT COUNT(*) FROM product_materials WHERE product_id=? AND is_deleted=0) bom_count`,
          [id],
        );
        if ((dependent?.bom_count ?? 0) > 0) {
          throw new ProductDomainError(
            'INVALID_PRODUCT_KIND',
            '已有 BOM 的成品必须保持为自制获取方式',
          );
        }
      }
      await connection.execute(
        `UPDATE products SET product_name=?,category_id=?,unit=?,acquire_method=?,spec_values=?,status=?,remark=?,version=version+1,updated_by=? WHERE id=? AND is_deleted=0`,
        [
          payload.productName,
          payload.categoryId,
          payload.unit,
          payload.acquireMethod,
          JSON.stringify(payload.specValues ?? []),
          payload.status,
          payload.remark ?? null,
          audit.actorId,
          id,
        ],
      );
      await writeProductCatalogAudit(connection, audit, 'product.update', id, before, payload);
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async setProductStatus(id: string, status: number, audit: CommandContext): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const before = await readProductCatalogRecord(connection, id, true);
      if (before.bom_status === 'pending_approval') {
        throw new ProductDomainError('CONFLICT', 'BOM 审批中，产品状态暂时不能修改');
      }
      await connection.execute(
        'UPDATE products SET status=?,version=version+1,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.actorId, id],
      );
      await writeProductCatalogAudit(
        connection,
        audit,
        'product.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }
}
