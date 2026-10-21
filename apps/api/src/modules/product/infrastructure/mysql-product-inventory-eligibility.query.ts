import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  ProductInventoryEligibility,
  type InventoryMaterialEligibility,
  type MaterialIdentityReference,
} from '../application/product-inventory-eligibility.query.js';
import type { ProductQueryResult } from '../application/product-snapshot.query.js';

type MaterialRow = RowDataPacket & {
  id: string;
  material_code: string;
  category_id: string;
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
  item_kind: string;
  status: number;
  is_deleted: number;
};

const sortedIds = (ids: string[]): string[] =>
  [...new Set(ids)].sort((left, right) => {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });

@Injectable()
export class MysqlProductInventoryEligibility extends ProductInventoryEligibility {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  requirePurchasableReferences(input: {
    references: MaterialIdentityReference[];
  }): Promise<ProductQueryResult<InventoryMaterialEligibility[]>> {
    return this.requireReferences(input.references, false);
  }

  requireProductionIssuableReferences(input: {
    references: MaterialIdentityReference[];
  }): Promise<ProductQueryResult<InventoryMaterialEligibility[]>> {
    return this.requireReferences(input.references, true);
  }

  private async requireReferences(
    references: MaterialIdentityReference[],
    requireEnabledVariant: boolean,
  ): Promise<ProductQueryResult<InventoryMaterialEligibility[]>> {
    return this.inTransaction(async (db) => {
      const materials = await this.lockMaterials(db, references);
      const categories = new Map<string, CategoryRow>();
      for (const id of sortedIds([...materials.values()].map((row) => String(row.category_id)))) {
        const [[row]] = await db.query<CategoryRow[]>(
          'SELECT id,item_kind,status,is_deleted FROM item_categories WHERE id=? FOR SHARE',
          [id],
        );
        if (row) categories.set(id, row);
      }
      const variants = await this.lockVariants(db, references);
      const result: InventoryMaterialEligibility[] = [];
      for (const reference of references) {
        const material = materials.get(reference.itemId);
        const variant = variants.get(reference.materialVariantId);
        if (!material || !variant || String(variant.material_id) !== reference.itemId) {
          return { status: 'not-found', message: '物料或精确版本不存在，或版本不属于该物料' };
        }
        const category = categories.get(String(material.category_id));
        if (
          material.is_deleted ||
          material.status !== 1 ||
          !category ||
          category.is_deleted ||
          category.status !== 1 ||
          category.item_kind !== 'material' ||
          variant.is_deleted ||
          (requireEnabledVariant && variant.status !== 1)
        ) {
          return {
            status: 'invalid-input',
            message: requireEnabledVariant
              ? '生产出库要求物料、分类和精确版本均启用且未删除'
              : '采购及入库要求物料与分类启用且未删除，精确版本未删除',
          };
        }
        result.push({
          ...reference,
          itemCode: material.material_code,
          materialVariantCode: variant.variant_code,
          unit: material.unit,
          variantStatus: variant.status,
        });
      }
      return { status: 'success', value: result };
    });
  }

  async lockHistoricalReferences(input: {
    references: MaterialIdentityReference[];
    productIds?: string[];
  }): Promise<ProductQueryResult<void>> {
    return this.inTransaction(async (db) => {
      const materials = await this.lockMaterials(db, input.references);
      const variants = await this.lockVariants(db, input.references);
      for (const reference of input.references) {
        const variant = variants.get(reference.materialVariantId);
        if (
          !materials.has(reference.itemId) ||
          !variant ||
          String(variant.material_id) !== reference.itemId
        ) {
          return { status: 'not-found', message: '历史库存物料与精确版本身份不一致' };
        }
      }
      for (const id of sortedIds(input.productIds ?? [])) {
        const [[row]] = await db.query<(RowDataPacket & { id: string })[]>(
          'SELECT id FROM products WHERE id=? FOR SHARE',
          [id],
        );
        if (!row) return { status: 'not-found', message: '历史库存成品身份不存在' };
      }
      return { status: 'success', value: undefined };
    });
  }

  private async lockMaterials(db: PoolConnection, references: MaterialIdentityReference[]) {
    const rows = new Map<string, MaterialRow>();
    for (const id of sortedIds(references.map((reference) => reference.itemId))) {
      const [[row]] = await db.query<MaterialRow[]>(
        'SELECT id,material_code,category_id,unit,status,is_deleted FROM materials WHERE id=? FOR SHARE',
        [id],
      );
      if (row) rows.set(id, row);
    }
    return rows;
  }

  private async lockVariants(db: PoolConnection, references: MaterialIdentityReference[]) {
    const rows = new Map<string, VariantRow>();
    for (const id of sortedIds(references.map((reference) => reference.materialVariantId))) {
      const [[row]] = await db.query<VariantRow[]>(
        'SELECT id,material_id,variant_code,status,is_deleted FROM material_variants WHERE id=? FOR SHARE',
        [id],
      );
      if (row) rows.set(id, row);
    }
    return rows;
  }

  private inTransaction<T>(work: (db: PoolConnection) => Promise<T>): Promise<T> {
    return withActiveConnection(this.pool, async (db) => {
      // 事务外的 FOR SHARE 在语句结束即释放，不能被误当作写资格保证。
      if (db === this.pool || !('release' in db)) {
        throw new Error('Product inventory eligibility requires an active transaction');
      }
      return work(db);
    });
  }
}
