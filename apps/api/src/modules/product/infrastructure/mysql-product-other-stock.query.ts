import { Inject, Injectable } from '@nestjs/common';
import { MATERIAL_OPTIONS_WINDOW_SIZE } from '@company/constants';
import type {
  OtherStockObject,
  OtherStockObjectQuery,
  OtherStockObjects,
} from '@company/contracts';
import { withActiveConnection } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  ProductOtherStockQuery,
  type OtherStockIdentityReference,
} from '../application/product-other-stock.query.js';
import type { ProductQueryResult } from '../application/product-snapshot.query.js';
import { ProductDomainError } from '../domain/product.errors.js';

type ObjectRow = RowDataPacket & {
  id: string;
  item_id: string | null;
  material_variant_id: string | null;
  product_id: string | null;
  code: string;
  name: string;
  material_variant_code: string | null;
  unit: string;
};
type ParentRow = RowDataPacket & {
  id: string;
  category_id: string;
  code: string;
  name: string;
  unit: string;
  status: number;
  is_deleted: number;
};
type VariantRow = RowDataPacket & {
  id: string;
  material_id: string;
  variant_code: string;
  status: number;
  is_deleted: number;
};
type CategoryRow = RowDataPacket & {
  id: string;
  item_kind: OtherStockIdentityReference['itemKind'];
  status: number;
  is_deleted: number;
};
type VariantLocator = RowDataPacket & { id: string; material_id: string };

const validId = (value: string | undefined): value is string =>
  value !== undefined &&
  /^[1-9]\d{0,19}$/.test(value) &&
  BigInt(value) <= 18_446_744_073_709_551_615n;

const sortedIds = (ids: string[]): string[] =>
  [...new Set(ids)].sort((left, right) => {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });

const mapObject = (row: ObjectRow, itemKind: OtherStockObject['itemKind']): OtherStockObject => ({
  id: row.id,
  itemKind,
  itemId: row.item_id,
  materialVariantId: row.material_variant_id,
  productId: row.product_id,
  code: row.code,
  name: row.name,
  materialVariantCode: row.material_variant_code,
  unit: row.unit,
});

@Injectable()
export class MysqlProductOtherStockQuery extends ProductOtherStockQuery {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listObjects(query: OtherStockObjectQuery): Promise<OtherStockObjects> {
    const includeIds = [...new Set(query.includeIds ?? [])];
    if (
      !['material', 'finished_product'].includes(query.itemKind) ||
      includeIds.length > 100 ||
      includeIds.some((id) => !validId(id))
    ) {
      throw new ProductDomainError('INVALID_INPUT', '库存对象类型或回显 ID 无效，最多回显 100 项');
    }
    const material = query.itemKind === 'material';
    const base = material
      ? `SELECT CAST(v.id AS CHAR) id,CAST(m.id AS CHAR) item_id,
                CAST(v.id AS CHAR) material_variant_id,NULL product_id,
                m.material_code code,m.material_name name,v.variant_code material_variant_code,m.unit
           FROM material_variants v JOIN materials m ON m.id=v.material_id
           JOIN item_categories c ON c.id=m.category_id
          WHERE m.status=1 AND m.is_deleted=0 AND v.status=1 AND v.is_deleted=0
            AND c.status=1 AND c.is_deleted=0 AND c.item_kind='material'`
      : `SELECT CAST(p.id AS CHAR) id,NULL item_id,NULL material_variant_id,
                CAST(p.id AS CHAR) product_id,p.item_code code,p.product_name name,
                NULL material_variant_code,p.unit
           FROM products p JOIN item_categories c ON c.id=p.category_id
          WHERE p.status=1 AND p.is_deleted=0
            AND c.status=1 AND c.is_deleted=0 AND c.item_kind='finished_product'`;
    const keyword = query.keyword?.trim();
    const keywordFilter = keyword
      ? material
        ? ' AND (m.material_code LIKE ? OR m.material_name LIKE ? OR v.variant_code LIKE ?)'
        : ' AND (p.item_code LIKE ? OR p.product_name LIKE ?)'
      : '';
    const keywordParameters = keyword ? Array<string>(material ? 3 : 2).fill(`%${keyword}%`) : [];
    const orderBy = material ? 'm.material_code,v.variant_code,v.id' : 'p.item_code,p.id';
    return withActiveConnection(this.pool, async (db) => {
      const [window] = await db.query<ObjectRow[]>(
        `${base}${keywordFilter} ORDER BY ${orderBy} LIMIT ?`,
        [...keywordParameters, MATERIAL_OPTIONS_WINDOW_SIZE + 1],
      );
      const selected = includeIds.length
        ? (
            await db.query<ObjectRow[]>(
              `${base} AND ${material ? 'v' : 'p'}.id IN (${includeIds.map(() => '?').join(',')}) ORDER BY ${orderBy}`,
              includeIds,
            )
          )[0]
        : [];
      const rows = new Map(
        [...window.slice(0, MATERIAL_OPTIONS_WINDOW_SIZE), ...selected].map((row) => [row.id, row]),
      );
      return {
        items: [...rows.values()].map((row) => mapObject(row, query.itemKind)),
        hasMore: window.length > MATERIAL_OPTIONS_WINDOW_SIZE,
      };
    });
  }

  resolveReferences(input: {
    references: OtherStockIdentityReference[];
  }): Promise<ProductQueryResult<OtherStockObject[]>> {
    return withActiveConnection(this.pool, async (db) => {
      // 自动提交下的共享锁不能保护后续建批或流水写入。
      if (db === this.pool || !('release' in db)) {
        throw new Error('Product other stock references require an active transaction');
      }
      const references = input.references;
      if (
        references.some(
          (reference) =>
            typeof reference.requireEnabled !== 'boolean' ||
            (reference.itemKind === 'material'
              ? !validId(reference.materialVariantId) || reference.productId !== undefined
              : reference.itemKind !== 'finished_product' ||
                !validId(reference.productId) ||
                reference.materialVariantId !== undefined),
        )
      ) {
        return { status: 'invalid-input', message: '物料精确版本与成品身份必须互斥且有效' };
      }
      if (!references.length) return { status: 'success', value: [] };

      const variantIds = sortedIds(
        references.flatMap((reference) =>
          reference.itemKind === 'material' && reference.materialVariantId
            ? [reference.materialVariantId]
            : [],
        ),
      );
      // material_id 创建后不可改，此读取只定位父身份；版本资格随后用当前锁定读复核。
      const locators = await this.locateVariants(db, variantIds);
      if (locators.size !== variantIds.length) {
        return { status: 'not-found', message: '库存物料精确版本不存在' };
      }
      const materials = await this.lockParents(
        db,
        'material',
        sortedIds([...locators.values()].map((row) => row.material_id)),
      );
      const products = await this.lockParents(
        db,
        'finished_product',
        sortedIds(
          references.flatMap((reference) =>
            reference.itemKind === 'finished_product' && reference.productId
              ? [reference.productId]
              : [],
          ),
        ),
      );
      const categories = await this.lockCategories(
        db,
        sortedIds([...materials.values(), ...products.values()].map((row) => row.category_id)),
      );
      const variants = await this.lockVariants(db, variantIds);
      const result: OtherStockObject[] = [];
      for (const reference of references) {
        const variant = reference.materialVariantId
          ? variants.get(reference.materialVariantId)
          : undefined;
        const parent =
          reference.itemKind === 'material'
            ? variant && materials.get(variant.material_id)
            : reference.productId && products.get(reference.productId);
        if (
          !parent ||
          (reference.itemKind === 'material' &&
            (!variant || variant.material_id !== locators.get(variant.id)?.material_id))
        ) {
          return { status: 'not-found', message: '历史库存对象或精确版本身份不存在或不一致' };
        }
        const category = categories.get(parent.category_id);
        if (!category || category.item_kind !== reference.itemKind) {
          return { status: 'invalid-input', message: '库存对象分类与身份类型不一致' };
        }
        if (
          reference.requireEnabled &&
          (parent.status !== 1 ||
            parent.is_deleted !== 0 ||
            category.status !== 1 ||
            category.is_deleted !== 0 ||
            (reference.itemKind === 'material' &&
              (!variant || variant.status !== 1 || variant.is_deleted !== 0)))
        ) {
          return {
            status: 'invalid-input',
            message: '新批次要求库存对象、分类及物料精确版本启用且未删除',
          };
        }
        result.push({
          id: variant?.id ?? parent.id,
          itemKind: reference.itemKind,
          itemId: reference.itemKind === 'material' ? parent.id : null,
          materialVariantId: variant?.id ?? null,
          productId: reference.itemKind === 'finished_product' ? parent.id : null,
          code: parent.code,
          name: parent.name,
          materialVariantCode: variant?.variant_code ?? null,
          unit: parent.unit,
        });
      }
      return { status: 'success', value: result };
    });
  }

  private async locateVariants(
    db: PoolConnection,
    variantIds: string[],
  ): Promise<Map<string, VariantLocator>> {
    if (!variantIds.length) return new Map();
    const [rows] = await db.query<VariantLocator[]>(
      `SELECT CAST(id AS CHAR) id,CAST(material_id AS CHAR) material_id
         FROM material_variants WHERE id IN (${variantIds.map(() => '?').join(',')})`,
      variantIds,
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async lockParents(
    db: PoolConnection,
    itemKind: OtherStockIdentityReference['itemKind'],
    ids: string[],
  ): Promise<Map<string, ParentRow>> {
    const rows = new Map<string, ParentRow>();
    const statement =
      itemKind === 'material'
        ? `SELECT CAST(id AS CHAR) id,CAST(category_id AS CHAR) category_id,
                  material_code code,material_name name,unit,status,is_deleted
             FROM materials WHERE id=? FOR SHARE`
        : `SELECT CAST(id AS CHAR) id,CAST(category_id AS CHAR) category_id,
                  item_code code,product_name name,unit,status,is_deleted
             FROM products WHERE id=? FOR SHARE`;
    for (const id of ids) {
      const [[row]] = await db.query<ParentRow[]>(statement, [id]);
      if (row) rows.set(id, row);
    }
    return rows;
  }

  private async lockCategories(
    db: PoolConnection,
    ids: string[],
  ): Promise<Map<string, CategoryRow>> {
    const rows = new Map<string, CategoryRow>();
    for (const id of ids) {
      const [[row]] = await db.query<CategoryRow[]>(
        'SELECT CAST(id AS CHAR) id,item_kind,status,is_deleted FROM item_categories WHERE id=? FOR SHARE',
        [id],
      );
      if (row) rows.set(id, row);
    }
    return rows;
  }

  private async lockVariants(db: PoolConnection, ids: string[]): Promise<Map<string, VariantRow>> {
    const rows = new Map<string, VariantRow>();
    for (const id of ids) {
      const [[row]] = await db.query<VariantRow[]>(
        `SELECT CAST(id AS CHAR) id,CAST(material_id AS CHAR) material_id,variant_code,status,is_deleted
           FROM material_variants WHERE id=? FOR SHARE`,
        [id],
      );
      if (row) rows.set(id, row);
    }
    return rows;
  }
}
