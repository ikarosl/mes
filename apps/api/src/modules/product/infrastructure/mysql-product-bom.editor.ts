import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { ProductItemKind, ReplaceProductMaterialsCommand } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { requireEditableBom, requireBomMaterialUnit } from '../domain/product-bom.policy.js';
import {
  productBomDefinition,
  readProductCatalogRecord,
  writeProductCatalogAudit,
} from './mysql-product-catalog.persistence.js';

/** 完整 BOM 替换只使用当前事务中的成品根与明细。 */
export class MysqlProductBomEditor {
  constructor(private readonly pool: Pool) {}

  async replaceMaterials(
    productId: string,
    command: ReplaceProductMaterialsCommand,
    audit: CommandContext,
  ): Promise<void> {
    const { items, version } = command;
    await withTransaction(this.pool, async (connection) => {
      const product = await readProductCatalogRecord(connection, productId, true);
      requireEditableBom(productBomDefinition(product), version);
      const before = await this.listMaterialRecords(connection, productId);
      for (const item of items) {
        const material = await this.requireMaterialCandidate(connection, item.materialId);
        requireBomMaterialUnit(item.unit, material.unit);
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
      await writeProductCatalogAudit(connection, audit, 'bom.replace', productId, before, items);
    });
  }

  private async requireMaterialCandidate(
    db: PoolConnection,
    materialId: string,
  ): Promise<{ status: number; unit: string; item_kind: ProductItemKind }> {
    const [[material]] = await db.query<
      (RowDataPacket & { status: number; unit: string; item_kind: ProductItemKind })[]
    >(
      `SELECT m.status,m.unit,c.item_kind FROM materials m JOIN item_categories c ON c.id=m.category_id
       WHERE m.id=? AND m.is_deleted=0 AND c.is_deleted=0`,
      [materialId],
    );
    if (!material || material.status !== 1 || material.item_kind !== 'material') {
      throw new ProductDomainError('INVALID_MATERIAL', 'BOM 投入对象必须是已启用的基础物料');
    }
    return material;
  }

  private async listMaterialRecords(
    db: PoolConnection,
    productId: string,
  ): Promise<
    (RowDataPacket & { id: number; material_id: number; quantity_per_unit: string; unit: string })[]
  > {
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
}
