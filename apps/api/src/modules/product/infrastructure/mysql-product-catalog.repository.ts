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
  BomApprovalSnapshot,
  ProductItemKind,
  ProductListItem,
  ProductGroupItem,
  ProductGroupQuery,
  ProductMaterialItem,
  ReplaceProductMaterialsCommand,
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
    const conditions = ['p.is_deleted=0', 'c.is_deleted=0', "c.item_kind='finished_product'"];
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
      `SELECT COUNT(*) total FROM products p JOIN product_categories c ON c.id=p.category_id WHERE ${where}`,
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
        bom_status: ProductListItem['bomStatus'];
        bom_approval_instance_id: number | null;
        version: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(
      `SELECT p.id,p.item_code,p.product_name,p.category_id,c.category_code,c.category_name,c.item_kind,
                    p.default_route_id,r.route_name default_route_name,p.unit,p.acquire_method,p.spec_values,p.status,
                    COUNT(pm.id) material_count,p.bom_locked_at,p.bom_locked_by,p.bom_status,
                    p.bom_approval_instance_id,p.version,p.remark,p.updated_at
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
      bomStatus: row.bom_status,
      bomApprovalInstanceId:
        row.bom_approval_instance_id === null ? null : String(row.bom_approval_instance_id),
      version: Number(row.version),
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
    return { items, total: Number(countRow?.total ?? 0), page, pageSize };
  }

  async listProductGroups(query: ProductGroupQuery): Promise<PageResult<ProductGroupItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['p.is_deleted=0', 'c.is_deleted=0', "c.item_kind='finished_product'"];
    const parameters: Array<string | number> = [];
    if (query.keyword) {
      const keyword = `%${query.keyword}%`;
      conditions.push('(p.product_name LIKE ? OR p.item_code LIKE ?)');
      parameters.push(keyword, keyword);
    }
    if (query.categoryId) {
      conditions.push('p.category_id=?');
      parameters.push(query.categoryId);
    }
    if (query.status !== undefined) {
      conditions.push('p.status=?');
      parameters.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM (
         SELECT p.product_name,p.category_id
           FROM products p JOIN product_categories c ON c.id=p.category_id
          WHERE ${where} GROUP BY p.product_name,p.category_id
       ) grouped_products`,
      parameters,
    );
    const [groups] = await this.pool.query<
      (RowDataPacket & {
        product_name: string;
        category_id: number;
        category_code: string;
        category_name: string;
      })[]
    >(
      `SELECT p.product_name,p.category_id,c.category_code,c.category_name
         FROM products p JOIN product_categories c ON c.id=p.category_id
        WHERE ${where}
        GROUP BY p.product_name,p.category_id,c.category_code,c.category_name
        ORDER BY p.product_name,p.category_id LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    if (groups.length === 0) return { items: [], total: Number(count?.total ?? 0), page, pageSize };
    const selectedGroups = groups
      .map(() => 'SELECT ? group_index, ? product_name, ? category_id')
      .join(' UNION ALL ');
    const groupParameters = groups.flatMap((group, index) => [
      index,
      group.product_name,
      group.category_id,
    ]);
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        group_index: number;
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
        bom_status: ProductListItem['bomStatus'];
        bom_approval_instance_id: number | null;
        version: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(
      `SELECT selected.group_index,p.id,p.item_code,p.product_name,p.category_id,c.category_code,c.category_name,c.item_kind,
              p.default_route_id,r.route_name default_route_name,p.unit,p.acquire_method,p.spec_values,p.status,
              COUNT(pm.id) material_count,p.bom_locked_at,p.bom_locked_by,p.bom_status,
              p.bom_approval_instance_id,p.version,p.remark,p.updated_at
         FROM products p JOIN product_categories c ON c.id=p.category_id
         JOIN (${selectedGroups}) selected ON p.product_name=selected.product_name AND p.category_id=selected.category_id
         LEFT JOIN process_routes r ON r.id=p.default_route_id AND r.is_deleted=0
         LEFT JOIN product_materials pm ON pm.product_id=p.id AND pm.is_deleted=0 AND pm.status=1
        WHERE p.is_deleted=0
        GROUP BY selected.group_index,p.id,c.category_code,c.category_name,c.item_kind,r.route_name
        ORDER BY p.product_name,p.category_id,p.item_code,p.id`,
      groupParameters,
    );
    const byKey = new Map<number, ProductListItem[]>();
    for (const row of rows) {
      const key = Number(row.group_index);
      const current = byKey.get(key) ?? [];
      current.push(this.mapProduct(row));
      byKey.set(key, current);
    }
    return {
      items: groups.map((group, index) => {
        const codes = byKey.get(index) ?? [];
        return {
          groupKey: `${group.category_id}:${encodeURIComponent(group.product_name)}`,
          productName: group.product_name,
          categoryId: String(group.category_id),
          categoryCode: group.category_code,
          categoryName: group.category_name,
          codeCount: codes.length,
          codes,
        };
      }),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async listProductOptions(): Promise<ProductOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        item_code: string;
        product_name: string;
        acquire_method: ProductOption['acquireMethod'];
        unit: string;
        default_route_id: number | null;
      })[]
    >(`SELECT p.id,p.item_code,p.product_name,p.acquire_method,p.unit,p.default_route_id
             FROM products p JOIN product_categories c ON c.id=p.category_id
             WHERE p.is_deleted=0 AND p.status=1 AND c.is_deleted=0 AND c.status=1
               AND c.item_kind='finished_product' ORDER BY p.item_code`);
    return rows.map((row) => ({
      id: String(row.id),
      itemCode: row.item_code,
      productName: row.product_name,
      acquireMethod: row.acquire_method,
      unit: row.unit,
      defaultRouteId: row.default_route_id === null ? null : String(row.default_route_id),
    }));
  }

  async createProduct(payload: ProductPayload, audit: CommandContext) {
    return withTransaction(this.pool, async (connection) => {
      await this.requireProductCategory(connection, payload.categoryId);
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
      await this.requireProductCategory(connection, payload.categoryId);
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
      await this.audit(connection, audit, 'product.update', id, before, payload);
    }).catch((error) =>
      mapProductWriteError(error, '编码或版本已存在，软删除记录的自然键也不能复用'),
    );
  }

  async setProductStatus(id: string, status: number, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.productRecord(connection, id, true);
      if (before.bom_status === 'pending_approval') {
        throw new ProductDomainError('CONFLICT', 'BOM 审批中，产品状态暂时不能修改');
      }
      await connection.execute(
        'UPDATE products SET status=?,version=version+1,updated_by=? WHERE id=? AND is_deleted=0',
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
        material_id: number;
        item_code: string;
        product_name: string;
        item_kind: ProductItemKind;
        quantity_per_unit: string;
        unit: string;
        status: number;
        remark: string | null;
      })[]
    >(
      `SELECT pm.id,pm.material_id,p.material_code item_code,p.material_name product_name,c.item_kind,pm.quantity_per_unit,
                    pm.unit,pm.status,pm.remark
             FROM product_materials pm JOIN materials p ON p.id=pm.material_id
             JOIN product_categories c ON c.id=p.category_id
             WHERE pm.product_id=? AND pm.is_deleted=0 ORDER BY pm.id`,
      [productId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      materialId: String(row.material_id),
      itemCode: row.item_code,
      productName: row.product_name,
      itemKind: row.item_kind,
      quantityPerUnit: String(row.quantity_per_unit),
      unit: row.unit,
      status: row.status,
      remark: row.remark,
    }));
  }

  async replaceMaterials(
    productId: string,
    command: ReplaceProductMaterialsCommand,
    audit: CommandContext,
  ) {
    const { items, version } = command;
    await withTransaction(this.pool, async (connection) => {
      const product = await this.productRecord(connection, productId, true);
      if (product.version !== version) {
        throw new ProductDomainError('CONFLICT', '产品资料已被其他操作修改，请重新加载 BOM 后重试');
      }
      if (product.bom_locked_at !== null) {
        throw new ProductDomainError(
          'CONFLICT',
          'BOM 已审批通过并永久锁定；原则变化请新建产品和产品编码',
        );
      }
      if (product.bom_status === 'pending_approval') {
        throw new ProductDomainError('CONFLICT', 'BOM 审批中，不能修改 BOM');
      }
      requireConfigurableProduct({
        status: product.status,
        acquireMethod: product.acquire_method,
        itemKind: product.item_kind,
      });
      if (product.acquire_method !== 'self_made') {
        throw new ProductDomainError('INVALID_PRODUCT_KIND', '只有自制成品可以配置 BOM');
      }
      const before = await this.listMaterialRecords(connection, productId);
      for (const item of items) {
        const material = await this.requireMaterialCandidate(
          connection,
          productId,
          item.materialId,
        );
        if (item.unit !== material.unit) {
          throw new ProductDomainError(
            'INVALID_MATERIAL',
            'BOM 用量单位必须等于投入物料的基础单位',
          );
        }
      }
      await connection.execute(
        'UPDATE product_materials SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE product_id=? AND is_deleted=0',
        [audit.actorId, audit.actorId, productId],
      );
      for (const item of items) {
        await connection.execute(
          `INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit,status,remark,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE quantity_per_unit=VALUES(quantity_per_unit),unit=VALUES(unit),status=VALUES(status),remark=VALUES(remark),updated_by=VALUES(updated_by),is_deleted=0,deleted_by=NULL,deleted_at=NULL`,
          [
            productId,
            item.materialId,
            item.quantityPerUnit,
            item.unit,
            item.status ?? 1,
            item.remark ?? null,
            audit.actorId,
            audit.actorId,
          ],
        );
      }
      await connection.execute(
        'UPDATE products SET version=version+1,updated_by=? WHERE id=? AND is_deleted=0',
        [audit.actorId, productId],
      );
      await this.audit(connection, audit, 'bom.replace', productId, before, items);
    });
  }

  async setDefaultRoute(productId: string, routeId: string | null, audit: CommandContext) {
    await withTransaction(this.pool, async (connection) => {
      let route: (RowDataPacket & { status: string }) | undefined;
      if (routeId) {
        [[route]] = await connection.query<(RowDataPacket & { status: string })[]>(
          'SELECT status FROM process_routes WHERE id=? AND is_deleted=0 FOR UPDATE',
          [routeId],
        );
      }
      const product = await this.productRecord(connection, productId, true);
      if (product.bom_status === 'pending_approval') {
        throw new ProductDomainError('CONFLICT', 'BOM 审批中，默认工艺路线暂时不能修改');
      }
      requireConfigurableProduct({
        status: product.status,
        acquireMethod: product.acquire_method,
        itemKind: product.item_kind,
      });
      if (product.acquire_method !== 'self_made') {
        throw new ProductDomainError('INVALID_PRODUCT_KIND', '只有自制成品可以设置默认工艺路线');
      }
      if (routeId) {
        if (!route || route.status !== 'enabled') {
          throw new ProductDomainError('INVALID_ROUTE', '默认路线必须是已启用的工艺路线');
        }
      }
      await connection.execute(
        'UPDATE products SET default_route_id=?,version=version+1,updated_by=? WHERE id=? AND is_deleted=0',
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

  async lockCurrentBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
  ): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const product = await this.productRecord(connection, productId, true);
      if (
        product.bom_status !== 'pending_approval' ||
        String(product.bom_approval_instance_id) !== instanceId ||
        Number(product.version) !== expectedVersion
      ) {
        throw new ProductDomainError('CONFLICT', 'BOM 当前审批关联已变化，请刷新后重试');
      }
    });
  }

  async prepareBomApproval(
    productId: string,
    expectedVersion: number,
    _audit: CommandContext,
  ): Promise<{ title: string; subjectVersion: number; snapshot: BomApprovalSnapshot }> {
    return withTransaction(this.pool, async (connection) => {
      const product = await this.productRecord(connection, productId, true);
      if (product.bom_status === 'pending_approval')
        throw new ProductDomainError('CONFLICT', '该产品已有进行中的 BOM 审批');
      if (product.bom_status === 'approved' || product.bom_locked_at !== null)
        throw new ProductDomainError('CONFLICT', 'BOM 已批准并永久锁定，原则变化请新建产品编码');
      await this.requireProductCategory(connection, String(product.category_id));
      if (product.version !== expectedVersion)
        throw new ProductDomainError('CONFLICT', '产品资料已被其他操作修改，请刷新后重试');
      if (
        product.status !== 1 ||
        product.item_kind !== 'finished_product' ||
        product.acquire_method !== 'self_made'
      )
        throw new ProductDomainError(
          'INVALID_PRODUCT_KIND',
          '只有已启用的自制成品可以提交 BOM 审批',
        );
      const [rows] = await connection.query<
        (RowDataPacket & {
          id: number;
          material_id: number;
          item_code: string;
          quantity_per_unit: string;
          unit: string;
          remark: string | null;
          material_unit: string;
          material_status: number;
          material_is_deleted: number;
          item_kind: ProductItemKind;
          category_status: number;
          category_is_deleted: number;
        })[]
      >(
        `SELECT pm.id,pm.material_id,m.material_code item_code,pm.quantity_per_unit,pm.unit,
                pm.remark,m.unit material_unit,
                m.status material_status,m.is_deleted material_is_deleted,c.item_kind,
                c.status category_status,c.is_deleted category_is_deleted
           FROM product_materials pm
           JOIN materials m ON m.id=pm.material_id
           JOIN product_categories c ON c.id=m.category_id
          WHERE pm.product_id=? AND pm.status=1 AND pm.is_deleted=0
          ORDER BY pm.id FOR UPDATE`,
        [productId],
      );
      if (rows.length === 0)
        throw new ProductDomainError('INVALID_MATERIAL', 'BOM 至少需要一条有效物料明细');
      if (
        rows.some(
          (row) =>
            row.material_status !== 1 ||
            row.material_is_deleted !== 0 ||
            row.item_kind !== 'material' ||
            row.category_status !== 1 ||
            row.category_is_deleted !== 0 ||
            row.unit !== row.material_unit,
        )
      )
        throw new ProductDomainError('INVALID_MATERIAL', 'BOM 包含不可用物料或用量单位不一致');
      const snapshot: BomApprovalSnapshot = {
        productId: String(product.id),
        itemCode: product.item_code,
        productName: product.product_name,
        unit: product.unit,
        specValues: this.json<BomApprovalSnapshot['specValues'][number]>(product.spec_values),
        materials: rows.map((row) => ({
          id: String(row.id),
          materialId: String(row.material_id),
          itemCode: row.item_code,
          quantityPerUnit: String(row.quantity_per_unit),
          unit: row.unit,
          remark: row.remark,
        })),
      };
      return {
        title: `${product.item_code} BOM审批`,
        subjectVersion: product.version,
        snapshot,
      };
    });
  }

  async bindBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<number> {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products SET bom_status='pending_approval',bom_approval_instance_id=?,version=version+1,updated_by=?
          WHERE id=? AND is_deleted=0 AND bom_status='draft' AND bom_locked_at IS NULL AND version=?`,
        [instanceId, audit.actorId, productId, expectedVersion],
      );
      if (result.affectedRows !== 1)
        throw new ProductDomainError('CONFLICT', '产品资料已被其他操作修改，请刷新后重试');
      await this.audit(
        connection,
        audit,
        'bom.submit',
        productId,
        { bomStatus: 'draft', version: expectedVersion },
        {
          bomStatus: 'pending_approval',
          approvalInstanceId: instanceId,
          version: expectedVersion + 1,
        },
      );
      return expectedVersion + 1;
    });
  }

  async finalizeBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const product = await this.productRecord(connection, productId, true);
      await this.requireProductCategory(connection, String(product.category_id));
      const [materials] = await connection.query<
        (RowDataPacket & {
          status: number;
          is_deleted: number;
          unit: string;
          bom_unit: string;
          category_status: number;
          category_deleted: number;
          item_kind: string;
        })[]
      >(
        `SELECT m.status,m.is_deleted,m.unit,pm.unit bom_unit,c.status category_status,c.is_deleted category_deleted,c.item_kind
         FROM product_materials pm JOIN materials m ON m.id=pm.material_id JOIN product_categories c ON c.id=m.category_id
         WHERE pm.product_id=? AND pm.status=1 AND pm.is_deleted=0 ORDER BY pm.material_id FOR UPDATE`,
        [productId],
      );
      if (
        !materials.length ||
        materials.some(
          (m) =>
            m.status !== 1 ||
            m.is_deleted !== 0 ||
            m.category_status !== 1 ||
            m.category_deleted !== 0 ||
            m.item_kind !== 'material' ||
            m.unit !== m.bom_unit,
        )
      ) {
        throw new ProductDomainError(
          'INVALID_MATERIAL',
          'BOM 物料当前不可用，请先恢复有效资料或撤回申请',
        );
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products SET bom_status='approved',bom_locked_at=NOW(),bom_locked_by=?,version=version+1,updated_by=?
          WHERE id=? AND is_deleted=0 AND bom_status='pending_approval' AND bom_approval_instance_id=?
            AND bom_locked_at IS NULL AND version=?`,
        [audit.actorId, audit.actorId, productId, instanceId, expectedVersion],
      );
      if (result.affectedRows !== 1)
        throw new ProductDomainError('CONFLICT', 'BOM 当前状态已变化，不能完成审批');
      await this.audit(
        connection,
        audit,
        'bom.approve',
        productId,
        { bomStatus: 'pending_approval', approvalInstanceId: instanceId, version: expectedVersion },
        { bomStatus: 'approved', approvalInstanceId: instanceId, bomLockedBy: audit.actorId },
      );
    });
  }

  async restoreBomAfterApprovalEnd(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,version=version+1,updated_by=?
          WHERE id=? AND is_deleted=0 AND bom_status='pending_approval' AND bom_approval_instance_id=?
            AND bom_locked_at IS NULL AND version=?`,
        [audit.actorId, productId, instanceId, expectedVersion],
      );
      if (result.affectedRows !== 1)
        throw new ProductDomainError('CONFLICT', 'BOM 当前状态已变化，不能恢复草稿');
      await this.audit(
        connection,
        audit,
        'bom.approval-end',
        productId,
        { bomStatus: 'pending_approval', approvalInstanceId: instanceId, version: expectedVersion },
        { bomStatus: 'draft', version: expectedVersion + 1 },
      );
    });
  }

  async listMaterialNames(materialIds: string[]): Promise<Record<string, string>> {
    if (materialIds.length === 0) return {};
    const [rows] = await this.pool.query<(RowDataPacket & { id: number; material_name: string })[]>(
      `SELECT id,material_name FROM materials WHERE id IN (${materialIds.map(() => '?').join(',')})`,
      materialIds,
    );
    return Object.fromEntries(rows.map((row) => [String(row.id), row.material_name]));
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
  private async requireProductCategory(db: Db, id: string) {
    const row = await this.requireCategory(db, id);
    if (row.item_kind !== 'finished_product')
      throw new ProductDomainError('INVALID_CATEGORY', '成品只能选择成品分类');
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
        bom_status: ProductListItem['bomStatus'];
        bom_approval_instance_id: number | null;
        version: number;
        spec_values: string | object | null;
      })[]
    >(
      `SELECT p.id,p.item_code,p.product_name,p.category_id,c.item_kind,p.acquire_method,p.status,p.default_route_id,p.unit,p.bom_locked_at,p.bom_status,p.bom_approval_instance_id,p.version,p.spec_values
           FROM products p JOIN product_categories c ON c.id=p.category_id WHERE p.id=? AND p.is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '产品或物料不存在');
    return row;
  }
  private async requireMaterialCandidate(db: Db, productId: string, materialId: string) {
    const [[material]] = await db.query<
      (RowDataPacket & { status: number; unit: string; item_kind: ProductItemKind })[]
    >(
      `SELECT m.status,m.unit,c.item_kind FROM materials m JOIN product_categories c ON c.id=m.category_id
       WHERE m.id=? AND m.is_deleted=0 AND c.is_deleted=0`,
      [materialId],
    );
    if (!material || material.status !== 1 || material.item_kind !== 'material') {
      throw new ProductDomainError('INVALID_MATERIAL', 'BOM 投入对象必须是已启用的基础物料');
    }
    return material;
  }
  private async listMaterialRecords(db: Db, productId: string) {
    const [rows] = await db.query<
      (RowDataPacket & {
        id: number;
        material_id: number;
        quantity_per_unit: string;
        unit: string;
      })[]
    >(
      'SELECT id,material_id,quantity_per_unit,unit FROM product_materials WHERE product_id=? AND is_deleted=0 ORDER BY id',
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

  private mapProduct(row: {
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
    bom_status: ProductListItem['bomStatus'];
    bom_approval_instance_id: number | null;
    version: number;
    remark: string | null;
    updated_at: Date | null;
  }): ProductListItem {
    return {
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
      bomStatus: row.bom_status,
      bomApprovalInstanceId:
        row.bom_approval_instance_id === null ? null : String(row.bom_approval_instance_id),
      version: Number(row.version),
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    };
  }
}
