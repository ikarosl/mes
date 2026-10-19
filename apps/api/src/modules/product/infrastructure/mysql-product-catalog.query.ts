import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  PageResult,
  ProductGroupItem,
  ProductGroupQuery,
  ProductItemKind,
  ProductListItem,
  ProductListQuery,
  ProductMaterialItem,
  ProductOption,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import {
  readProductCatalogRecord,
  readProductSpecValues,
} from './mysql-product-catalog.persistence.js';

/** 展示读取与候选投影不承担 BOM 编辑或审批资格判断。 */
export class MysqlProductCatalogQuery {
  constructor(private readonly pool: Pool) {}

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
      `SELECT COUNT(*) total FROM products p JOIN item_categories c ON c.id=p.category_id WHERE ${where}`,
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
                    p.unit,p.acquire_method,p.spec_values,p.status,
                    COUNT(pm.id) material_count,p.bom_locked_at,p.bom_locked_by,p.bom_status,
                    p.bom_approval_instance_id,p.version,p.remark,p.updated_at
             FROM products p JOIN item_categories c ON c.id=p.category_id
             LEFT JOIN product_materials pm ON pm.product_id=p.id AND pm.is_deleted=0 AND pm.status=1
             WHERE ${where} GROUP BY p.id,c.category_code,c.category_name,c.item_kind
             ORDER BY p.item_code,p.id LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const items = rows.map((row) => this.mapProduct(row));
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
           FROM products p JOIN item_categories c ON c.id=p.category_id
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
         FROM products p JOIN item_categories c ON c.id=p.category_id
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
              p.unit,p.acquire_method,p.spec_values,p.status,
              COUNT(pm.id) material_count,p.bom_locked_at,p.bom_locked_by,p.bom_status,
              p.bom_approval_instance_id,p.version,p.remark,p.updated_at
         FROM products p JOIN item_categories c ON c.id=p.category_id
         JOIN (${selectedGroups}) selected ON p.product_name=selected.product_name AND p.category_id=selected.category_id
         LEFT JOIN product_materials pm ON pm.product_id=p.id AND pm.is_deleted=0 AND pm.status=1
        WHERE p.is_deleted=0
        GROUP BY selected.group_index,p.id,c.category_code,c.category_name,c.item_kind
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
      })[]
    >(`SELECT p.id,p.item_code,p.product_name,p.acquire_method,p.unit
             FROM products p JOIN item_categories c ON c.id=p.category_id
             WHERE p.is_deleted=0 AND p.status=1 AND c.is_deleted=0 AND c.status=1
               AND c.item_kind='finished_product' ORDER BY p.item_code`);
    return rows.map((row) => ({
      id: String(row.id),
      itemCode: row.item_code,
      productName: row.product_name,
      acquireMethod: row.acquire_method,
      unit: row.unit,
    }));
  }

  async listMaterials(productId: string): Promise<ProductMaterialItem[]> {
    await readProductCatalogRecord(this.pool, productId);
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
             JOIN item_categories c ON c.id=p.category_id
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

  async listMaterialNames(materialIds: string[]): Promise<Record<string, string>> {
    if (materialIds.length === 0) return {};
    const [rows] = await this.pool.query<(RowDataPacket & { id: number; material_name: string })[]>(
      `SELECT id,material_name FROM materials WHERE id IN (${materialIds.map(() => '?').join(',')})`,
      materialIds,
    );
    return Object.fromEntries(rows.map((row) => [String(row.id), row.material_name]));
  }

  private date(value: Date | null): string | null {
    return value ? toBeijingISOString(value) : null;
  }

  private mapProduct(row: {
    id: number;
    item_code: string;
    product_name: string;
    category_id: number;
    category_code: string;
    category_name: string;
    item_kind: ProductItemKind;
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
      unit: row.unit,
      acquireMethod: row.acquire_method,
      specValues: readProductSpecValues<ProductListItem['specValues'][number]>(row.spec_values),
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
