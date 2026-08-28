import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { requireConfigurableProduct } from '../domain/product-configuration.policy.js';
import { mapProductWriteError } from './mysql-product.shared.js';

type Db = Pool | PoolConnection;
import type {
  ProductItemKind,
  ProductListItem,
  ProductMaterialItem,
  ProductMaterialPayload,
  ProductListQuery,
  PageResult,
  ProductOption,
  ProductPayload,
} from '@company/contracts';
import { type ProductCatalogRepository } from '../application/ports/product-catalog.repository.js';

@Injectable()
export class MysqlProductCatalogRepository implements ProductCatalogRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listProducts(query: ProductListQuery): Promise<PageResult<ProductListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['p.is_deleted=0'];
    const parameters: Array<string | number> = [];
    if (query.keyword) {
      const keyword = `%${query.keyword}%`;
      conditions.push('(p.item_code LIKE ? OR p.product_name LIKE ?)');
      parameters.push(keyword, keyword);
    }
    if (query.categoryId) {
      conditions.push('p.category_id=?');
      parameters.push(query.categoryId);
    }
    if (query.acquireMethod) {
      conditions.push('p.acquire_method=?');
      parameters.push(query.acquireMethod);
    }
    if (query.status !== undefined) {
      conditions.push('p.status=?');
      parameters.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[countRow]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM products p WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        item_code: string;
        product_name: string;
        category_id: number;
        category_code: string;
        category_name: string;
        item_kind: ProductItemKind;
        default_route_id: number | null;
        default_route_name: string | null;
        unit: string;
        acquire_method: ProductListItem['acquireMethod'];
        spec_values: string | object | null;
        status: number;
        material_count: number;
        bom_locked_at: Date | null;
        bom_locked_by: number | null;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(
      `SELECT p.id,p.item_code,p.product_name,p.category_id,c.category_code,c.category_name,c.item_kind,
                    p.default_route_id,r.route_name default_route_name,p.unit,p.acquire_method,p.spec_values,p.status,
                    COUNT(pm.id) material_count,p.bom_locked_at,p.bom_locked_by,p.remark,p.updated_at
             FROM products p JOIN product_categories c ON c.id=p.category_id
             LEFT JOIN process_routes r ON r.id=p.default_route_id AND r.is_deleted=0
             LEFT JOIN product_materials pm ON pm.product_id=p.id AND pm.is_deleted=0 AND pm.status=1
             WHERE ${where} GROUP BY p.id,c.category_code,c.category_name,c.item_kind,r.route_name
             ORDER BY p.item_code,p.id LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const items = rows.map((row) => ({
      id: String(row.id),
      itemCode: row.item_code,
      productName: row.product_name,
      categoryId: String(row.category_id),
      categoryCode: row.category_code,
      categoryName: row.category_name,
      itemKind: row.item_kind,
      defaultRouteId: row.default_route_id === null ? null : String(row.default_route_id),
      defaultRouteName: row.default_route_name,
      unit: row.unit,
      acquireMethod: row.acquire_method,
      specValues: this.json<ProductListItem['specValues'][number]>(row.spec_values),
      status: row.status,
      materialCount: Number(row.material_count),
      bomLockedAt: this.date(row.bom_locked_at),
      bomLockedById: row.bom_locked_by === null ? null : String(row.bom_locked_by),
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
    return { items, total: Number(countRow?.total ?? 0), page, pageSize };
  }

  async listProductOptions(): Promise<ProductOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        item_code: string;
        product_name: string;
        item_kind: ProductItemKind;
        acquire_method: ProductOption['acquireMethod'];
        unit: string;
        default_route_id: number | null;
      })[]
    >(`SELECT p.id,p.item_code,p.product_name,c.item_kind,p.acquire_method,p.unit,p.default_route_id
             FROM products p JOIN product_categories c ON c.id=p.category_id
             WHERE p.is_deleted=0 AND p.status=1 AND c.is_deleted=0 AND c.status=1 ORDER BY p.item_code`);
    return rows.map((row) => ({
      id: String(row.id),
      itemCode: row.item_code,
      productName: row.product_name,
      itemKind: row.item_kind,
      acquireMethod: row.acquire_method,
      unit: row.unit,
      defaultRouteId: row.default_route_id === null ? null : String(row.default_route_id),
    }));
  }

  async createProduct(payload: ProductPayload, audit: CommandContext) {
    return withTransaction(this.pool, async (connection) => {
      await this.requireCategory(connection, payload.categoryId);
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
      await this.audit(connection, audit, 'product.create', String(result.insertId), null, payload);
      return { id: String(result.insertId) };
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async updateProduct(id: string, payload: ProductPayload, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.productRecord(connection, id, true);
      if (payload.itemCode !== before.item_code || payload.unit !== before.unit) {
        throw new ProductDomainError(
          'CONFLICT',
          '产品编码和基础单位创建后不可修改；原则变化请新建产品',
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
      const category = await this.requireCategory(connection, payload.categoryId);
      if (payload.acquireMethod !== 'self_made' || category.item_kind === 'material') {
        const [[dependent]] = await connection.query<
          (RowDataPacket & { bom_count: number; route_count: number })[]
        >(
          `SELECT (SELECT COUNT(*) FROM product_materials WHERE product_id=? AND is_deleted=0) bom_count,
                  (SELECT COUNT(*) FROM process_routes WHERE product_id=? AND is_deleted=0) route_count`,
          [id, id],
        );
        if ((dependent?.bom_count ?? 0) > 0 || (dependent?.route_count ?? 0) > 0) {
          throw new ProductDomainError(
            'INVALID_PRODUCT_KIND',
            '已有 BOM 或工艺路线的对象必须保持为自制半成品或成品',
          );
        }
      }
      await connection.execute(
        `UPDATE products SET item_code=?,product_name=?,category_id=?,unit=?,acquire_method=?,spec_values=?,status=?,remark=?,updated_by=? WHERE id=? AND is_deleted=0`,
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
          id,
        ],
      );
      await this.audit(connection, audit, 'product.update', id, before, payload);
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async setProductStatus(id: string, status: number, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.productRecord(connection, id, true);
      await connection.execute(
        'UPDATE products SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.actorId, id],
      );
      await this.audit(
        connection,
        audit,
        'product.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }

  async listMaterials(productId: string): Promise<ProductMaterialItem[]> {
    await this.productRecord(this.pool, productId);
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        material_product_id: number;
        item_code: string;
        product_name: string;
        item_kind: ProductItemKind;
        quantity_per_unit: string;
        unit: string;
        is_key_material: number;
        need_batch_record: number;
        status: number;
        remark: string | null;
      })[]
    >(
      `SELECT pm.id,pm.material_product_id,p.item_code,p.product_name,c.item_kind,pm.quantity_per_unit,
                    pm.unit,pm.is_key_material,pm.need_batch_record,pm.status,pm.remark
             FROM product_materials pm JOIN products p ON p.id=pm.material_product_id
             JOIN product_categories c ON c.id=p.category_id
             WHERE pm.product_id=? AND pm.is_deleted=0 ORDER BY pm.id`,
      [productId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      materialProductId: String(row.material_product_id),
      itemCode: row.item_code,
      productName: row.product_name,
      itemKind: row.item_kind,
      quantityPerUnit: String(row.quantity_per_unit),
      unit: row.unit,
      isKeyMaterial: Boolean(row.is_key_material),
      needBatchRecord: Boolean(row.need_batch_record),
      status: row.status,
      remark: row.remark,
    }));
  }

  async replaceMaterials(
    productId: string,
    items: ProductMaterialPayload[],
    audit: CommandContext,
  ) {
    await withTransaction(this.pool, async (connection) => {
      const product = await this.productRecord(connection, productId, true);
      if (product.bom_locked_at !== null) {
        throw new ProductDomainError(
          'CONFLICT',
          'BOM 已被生产任务引用并永久锁定；原则变化请新建产品和产品编码',
        );
      }
      requireConfigurableProduct({
        status: product.status,
        acquireMethod: product.acquire_method,
        itemKind: product.item_kind,
      });
      if (product.acquire_method !== 'self_made' || product.item_kind === 'material') {
        throw new ProductDomainError('INVALID_PRODUCT_KIND', '只有自制半成品或成品可以配置 BOM');
      }
      const before = await this.listMaterialRecords(connection, productId);
      const desiredIds = items.map((item) => item.materialProductId);
      for (const item of items) {
        const material = await this.requireMaterialCandidate(
          connection,
          productId,
          item.materialProductId,
        );
        if (item.unit !== material.unit) {
          throw new ProductDomainError(
            'INVALID_MATERIAL',
            'BOM 用量单位必须等于投入物料的基础单位',
          );
        }
      }
      const removed = before.filter(
        (item) => !desiredIds.includes(String(item.material_product_id)),
      );
      if (removed.length) {
        const [used] = await connection.query<RowDataPacket[]>(
          `SELECT rsm.id FROM route_step_materials rsm WHERE rsm.product_material_id IN (${removed.map(() => '?').join(',')}) LIMIT 1`,
          removed.map((item) => item.id),
        );
        if (used.length)
          throw new ProductDomainError('CONFLICT', 'BOM 明细已被工艺路线步骤使用，不能移除');
      }
      await connection.execute(
        'UPDATE product_materials SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE product_id=? AND is_deleted=0',
        [audit.actorId, audit.actorId, productId],
      );
      for (const item of items) {
        await connection.execute(
          `INSERT INTO product_materials (product_id,material_product_id,quantity_per_unit,unit,is_key_material,need_batch_record,status,remark,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE quantity_per_unit=VALUES(quantity_per_unit),unit=VALUES(unit),is_key_material=VALUES(is_key_material),
             need_batch_record=VALUES(need_batch_record),status=VALUES(status),remark=VALUES(remark),updated_by=VALUES(updated_by),is_deleted=0,deleted_by=NULL,deleted_at=NULL`,
          [
            productId,
            item.materialProductId,
            item.quantityPerUnit,
            item.unit,
            Number(item.isKeyMaterial),
            Number(item.needBatchRecord),
            item.status ?? 1,
            item.remark ?? null,
            audit.actorId,
            audit.actorId,
          ],
        );
      }
      await this.audit(connection, audit, 'bom.replace', productId, before, items);
    });
  }

  async setDefaultRoute(productId: string, routeId: string | null, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      let route: (RowDataPacket & { product_id: number; status: string }) | undefined;
      if (routeId) {
        [[route]] = await connection.query<
          (RowDataPacket & { product_id: number; status: string })[]
        >('SELECT product_id,status FROM process_routes WHERE id=? AND is_deleted=0 FOR UPDATE', [
          routeId,
        ]);
      }
      const product = await this.productRecord(connection, productId, true);
      requireConfigurableProduct({
        status: product.status,
        acquireMethod: product.acquire_method,
        itemKind: product.item_kind,
      });
      if (product.acquire_method !== 'self_made' || product.item_kind === 'material') {
        throw new ProductDomainError(
          'INVALID_PRODUCT_KIND',
          '只有自制半成品或成品可以设置默认工艺路线',
        );
      }
      if (routeId) {
        if (!route || String(route.product_id) !== productId || route.status !== 'enabled') {
          throw new ProductDomainError('INVALID_ROUTE', '默认路线必须是该产品已启用的工艺路线');
        }
      }
      await connection.execute(
        'UPDATE products SET default_route_id=?,updated_by=? WHERE id=? AND is_deleted=0',
        [routeId, audit.actorId, productId],
      );
      await this.audit(
        connection,
        audit,
        'product.default-route',
        productId,
        { defaultRouteId: product.default_route_id },
        { defaultRouteId: routeId },
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
        unit: string;
        bom_locked_at: Date | null;
      })[]
    >(
      `SELECT p.id,p.item_code,p.product_name,p.category_id,c.item_kind,p.acquire_method,p.status,p.default_route_id,p.unit,p.bom_locked_at
           FROM products p JOIN product_categories c ON c.id=p.category_id WHERE p.id=? AND p.is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '产品或物料不存在');
    return row;
  }
  private async requireMaterialCandidate(db: Db, productId: string, materialId: string) {
    const material = await this.productRecord(db, materialId);
    if (
      materialId === productId ||
      material.status !== 1 ||
      !['material', 'semi_finished'].includes(material.item_kind)
    ) {
      throw new ProductDomainError(
        'INVALID_MATERIAL',
        'BOM 投入对象必须是已启用的物料或半成品，且不能引用产品自身',
      );
    }
    return material;
  }
  private async listMaterialRecords(db: Db, productId: string) {
    const [rows] = await db.query<
      (RowDataPacket & {
        id: number;
        material_product_id: number;
        quantity_per_unit: string;
        unit: string;
      })[]
    >(
      'SELECT id,material_product_id,quantity_per_unit,unit FROM product_materials WHERE product_id=? AND is_deleted=0 ORDER BY id',
      [productId],
    );
    return rows;
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
  private json<T>(value: string | object | null): T[] {
    if (!value) return [];
    return (typeof value === 'string' ? JSON.parse(value) : value) as T[];
  }
}
