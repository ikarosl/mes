import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { ProductBomVersionDetail, ProductBomVersionListItem } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { requireConfigurableProduct } from '../domain/product-configuration.policy.js';
import { mapProductWriteError } from './mysql-product.shared.js';
import {
  ProductBomVersionRepository,
  type ProductBomVersionLinePayload,
} from '../application/ports/product-bom-version.repository.js';

type Db = Pool | PoolConnection;

type BomVersionRow = RowDataPacket & {
  id: number;
  product_id: number;
  version_no: string;
  status: 'draft' | 'published' | 'superseded';
  change_reason: string | null;
  remark: string | null;
  created_by: number | null;
  published_by: number | null;
  published_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type BomVersionListRow = BomVersionRow & {
  line_count: number;
  is_current: number;
};

type BomLineRow = RowDataPacket & {
  id: number;
  line_no: number;
  material_product_id: number;
  item_code_snapshot: string;
  item_name_snapshot: string;
  unit_snapshot: string;
  quantity_per_unit: string;
  is_key_material: number;
  need_batch_record: number;
  remark: string | null;
};

type MaterialCandidateRow = RowDataPacket & {
  id: number;
  item_code: string;
  product_name: string;
  unit: string;
  status: number;
  is_deleted: number;
  item_kind: 'material' | 'semi_finished' | 'finished_product';
  category_status: number;
  category_is_deleted: number;
};

@Injectable()
export class MysqlProductBomVersionRepository implements ProductBomVersionRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listByProduct(productId: string): Promise<ProductBomVersionListItem[]> {
    await this.requireProduct(this.pool, productId);
    const [rows] = await this.pool.query<BomVersionListRow[]>(
      `SELECT v.id,v.product_id,v.version_no,v.status,v.change_reason,v.remark,
              v.created_by,v.published_by,v.published_at,v.created_at,v.updated_at,
              COUNT(l.id) line_count,
              CASE WHEN p.current_bom_version_id = v.id THEN 1 ELSE 0 END is_current
         FROM product_bom_versions v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN product_bom_version_lines l ON l.bom_version_id = v.id AND l.is_deleted = 0
        WHERE v.product_id = ? AND v.is_deleted = 0
        GROUP BY v.id,v.product_id,v.version_no,v.status,v.change_reason,v.remark,
                 v.created_by,v.published_by,v.published_at,v.created_at,v.updated_at,
                 p.current_bom_version_id
        ORDER BY v.id`,
      [productId],
    );
    return rows.map((row) => this.toListItem(row));
  }

  async getDetail(bomVersionId: string): Promise<ProductBomVersionDetail> {
    return this.getDetailIn(this.pool, bomVersionId);
  }

  async createDraft(productId: string, audit: CommandContext): Promise<ProductBomVersionDetail> {
    return withTransaction(this.pool, async (connection) => {
      await this.requireConfigurableProduct(connection, productId, true);
      const existingDraftId = await this.findDraftId(connection, productId);
      if (existingDraftId)
        throw new ProductDomainError(
          'CONFLICT',
          '该产品已存在草稿 BOM 版本，请继续编辑或删除原草稿',
          { draftBomVersionId: existingDraftId },
        );
      const versionNo = await this.nextVersionNo(connection, productId);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO product_bom_versions (product_id,version_no,status,created_by,updated_by)
         VALUES (?,?,'draft',?,?)`,
        [productId, versionNo, audit.actorId, audit.actorId],
      );
      await this.audit(
        connection,
        audit,
        'bom-version.create-draft',
        String(result.insertId),
        null,
        {
          productId,
          versionNo,
        },
      );
      return this.getDetailIn(connection, String(result.insertId));
    }).catch((error) =>
      mapProductWriteError(error, '该产品已存在草稿或同版本号 BOM，请刷新后重试'),
    );
  }

  async copyAsDraft(
    sourceVersionId: string,
    audit: CommandContext,
  ): Promise<ProductBomVersionDetail> {
    return withTransaction(this.pool, async (connection) => {
      const { version: source } = await this.lockConfigurableVersion(connection, sourceVersionId);
      if (source.status === 'draft')
        throw new ProductDomainError('INVALID_INPUT', '草稿 BOM 版本不能作为复制来源');
      const existingDraftId = await this.findDraftId(connection, String(source.product_id));
      if (existingDraftId)
        throw new ProductDomainError(
          'CONFLICT',
          '该产品已存在草稿 BOM 版本，请继续编辑或删除原草稿',
          { draftBomVersionId: existingDraftId },
        );
      const versionNo = await this.nextVersionNo(connection, String(source.product_id));
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO product_bom_versions (product_id,version_no,status,change_reason,created_by,updated_by)
         VALUES (?,?,'draft',NULL,?,?)`,
        [source.product_id, versionNo, audit.actorId, audit.actorId],
      );
      const newVersionId = result.insertId;
      await connection.execute(
        `INSERT INTO product_bom_version_lines
           (bom_version_id,line_no,material_product_id,quantity_per_unit,
            item_code_snapshot,item_name_snapshot,unit_snapshot,is_key_material,need_batch_record,remark,created_by,updated_by)
         SELECT ?,line_no,material_product_id,quantity_per_unit,
                item_code_snapshot,item_name_snapshot,unit_snapshot,is_key_material,need_batch_record,remark,?,?
           FROM product_bom_version_lines
          WHERE bom_version_id = ? AND is_deleted = 0
          ORDER BY line_no`,
        [newVersionId, audit.actorId, audit.actorId, sourceVersionId],
      );
      await this.audit(
        connection,
        audit,
        'bom-version.copy-draft',
        String(newVersionId),
        { sourceBomVersionId: sourceVersionId },
        { productId: String(source.product_id), versionNo },
      );
      return this.getDetailIn(connection, String(newVersionId));
    }).catch((error) =>
      mapProductWriteError(error, '该产品已存在草稿或同版本号 BOM，请刷新后重试'),
    );
  }

  async replaceDraftLines(
    bomVersionId: string,
    lines: ProductBomVersionLinePayload[],
    audit: CommandContext,
  ): Promise<ProductBomVersionDetail> {
    return withTransaction(this.pool, async (connection) => {
      const { version } = await this.lockConfigurableVersion(connection, bomVersionId);
      this.assertDraft(version);
      const before = await this.listLines(connection, bomVersionId);
      await connection.execute('DELETE FROM product_bom_version_lines WHERE bom_version_id = ?', [
        bomVersionId,
      ]);
      for (const [index, line] of lines.entries()) {
        const material = await this.requireMaterialCandidate(
          connection,
          String(version.product_id),
          line.materialProductId,
        );
        await connection.execute(
          `INSERT INTO product_bom_version_lines
             (bom_version_id,line_no,material_product_id,quantity_per_unit,
              item_code_snapshot,item_name_snapshot,unit_snapshot,is_key_material,need_batch_record,remark,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            bomVersionId,
            index + 1,
            line.materialProductId,
            line.quantityPerUnit,
            material.item_code,
            material.product_name,
            material.unit,
            Number(line.isKeyMaterial),
            Number(line.needBatchRecord),
            line.remark ?? null,
            audit.actorId,
            audit.actorId,
          ],
        );
      }
      await this.audit(connection, audit, 'bom-version.replace-lines', bomVersionId, before, lines);
      return this.getDetailIn(connection, bomVersionId);
    });
  }

  async publish(
    bomVersionId: string,
    changeReason: string,
    audit: CommandContext,
  ): Promise<ProductBomVersionDetail> {
    return withTransaction(this.pool, async (connection) => {
      const { version, product } = await this.lockConfigurableVersion(connection, bomVersionId);
      this.assertDraft(version);
      const lines = await this.listPublishLines(connection, bomVersionId);
      if (lines.length === 0)
        throw new ProductDomainError('INVALID_INPUT', 'BOM 版本至少包含一行物料明细');
      for (const line of lines) {
        this.assertPublishLine(version.product_id, line);
      }
      await connection.execute(
        `UPDATE product_bom_versions
            SET status = 'superseded', updated_by = ?
          WHERE product_id = ? AND status = 'published' AND id <> ? AND is_deleted = 0`,
        [audit.actorId, version.product_id, version.id],
      );
      await connection.execute(
        `UPDATE product_bom_versions
            SET status = 'published', change_reason = ?, published_by = ?, published_at = NOW(), updated_by = ?
          WHERE id = ?`,
        [changeReason, audit.actorId, audit.actorId, version.id],
      );
      await connection.execute(
        'UPDATE products SET current_bom_version_id = ?, updated_by = ? WHERE id = ?',
        [version.id, audit.actorId, version.product_id],
      );
      await this.audit(
        connection,
        audit,
        'bom-version.publish',
        bomVersionId,
        { status: 'draft', currentBomVersionId: product.current_bom_version_id },
        { status: 'published', currentBomVersionId: String(version.id), changeReason },
      );
      return this.getDetailIn(connection, bomVersionId);
    });
  }

  async deleteDraft(bomVersionId: string, audit: CommandContext): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const { version } = await this.lockConfigurableVersion(connection, bomVersionId);
      this.assertDraft(version);
      await connection.execute('DELETE FROM product_bom_version_lines WHERE bom_version_id = ?', [
        bomVersionId,
      ]);
      await connection.execute('DELETE FROM product_bom_versions WHERE id = ?', [bomVersionId]);
      await this.audit(connection, audit, 'bom-version.delete-draft', bomVersionId, version, null);
    });
  }

  private async getDetailIn(db: Db, bomVersionId: string): Promise<ProductBomVersionDetail> {
    const version = await this.findVersion(db, bomVersionId);
    const [[productRow]] = await db.query<
      (RowDataPacket & {
        item_code: string;
        product_name: string;
        unit: string;
        current_bom_version_id: number | null;
      })[]
    >(
      `SELECT p.item_code,p.product_name,p.unit,p.current_bom_version_id
         FROM products p WHERE p.id = ?`,
      [version.product_id],
    );
    if (!productRow) throw new ProductDomainError('NOT_FOUND', '产品不存在');
    const lines = await this.listLines(db, bomVersionId);
    return {
      ...this.toListItem({
        ...version,
        line_count: lines.length,
        is_current: productRow.current_bom_version_id === version.id ? 1 : 0,
      }),
      product: {
        id: String(version.product_id),
        itemCode: productRow.item_code,
        productName: productRow.product_name,
        unit: productRow.unit,
      },
      lines,
    };
  }

  private async findVersion(db: Db, bomVersionId: string, lock = false): Promise<BomVersionRow> {
    const [rows] = await db.query<BomVersionRow[]>(
      `SELECT id,product_id,version_no,status,change_reason,remark,
              created_by,published_by,published_at,created_at,updated_at
         FROM product_bom_versions
        WHERE id = ? AND is_deleted = 0${lock ? ' FOR UPDATE' : ''}`,
      [bomVersionId],
    );
    if (!rows[0]) throw new ProductDomainError('NOT_FOUND', 'BOM 版本不存在');
    return rows[0];
  }

  private async listLines(db: Db, bomVersionId: string) {
    const [rows] = await db.query<BomLineRow[]>(
      `SELECT id,line_no,material_product_id,item_code_snapshot,item_name_snapshot,unit_snapshot,
              quantity_per_unit,is_key_material,need_batch_record,remark
         FROM product_bom_version_lines
        WHERE bom_version_id = ? AND is_deleted = 0
        ORDER BY line_no`,
      [bomVersionId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      lineNo: row.line_no,
      materialProductId: String(row.material_product_id),
      itemCode: row.item_code_snapshot,
      itemName: row.item_name_snapshot,
      unit: row.unit_snapshot,
      quantityPerUnit: row.quantity_per_unit,
      isKeyMaterial: Boolean(row.is_key_material),
      needBatchRecord: Boolean(row.need_batch_record),
      remark: row.remark,
    }));
  }

  private async listPublishLines(db: Db, bomVersionId: string) {
    const [rows] = await db.query<
      (RowDataPacket & {
        id: number;
        line_no: number;
        material_product_id: number;
        quantity_per_unit: string;
        unit_snapshot: string;
        item_code_snapshot: string;
        item_name_snapshot: string;
        material_status: number;
        material_is_deleted: number;
        material_item_kind: 'material' | 'semi_finished' | 'finished_product';
        material_unit: string;
        category_status: number;
        category_is_deleted: number;
      })[]
    >(
      `SELECT l.id,l.line_no,l.material_product_id,l.quantity_per_unit,l.unit_snapshot,
              l.item_code_snapshot,l.item_name_snapshot,
              p.status material_status,p.is_deleted material_is_deleted,p.unit material_unit,
              c.item_kind material_item_kind,c.status category_status,c.is_deleted category_is_deleted
         FROM product_bom_version_lines l
         JOIN products p ON p.id = l.material_product_id
         JOIN product_categories c ON c.id = p.category_id
        WHERE l.bom_version_id = ? AND l.is_deleted = 0
        ORDER BY l.line_no
        FOR UPDATE`,
      [bomVersionId],
    );
    return rows;
  }

  private assertPublishLine(
    productId: number,
    line: {
      line_no: number;
      material_product_id: number;
      quantity_per_unit: string;
      unit_snapshot: string;
      material_status: number;
      material_is_deleted: number;
      material_item_kind: 'material' | 'semi_finished' | 'finished_product';
      material_unit: string;
      category_status: number;
      category_is_deleted: number;
    },
  ): void {
    const quantity = Number(line.quantity_per_unit);
    if (
      line.material_product_id === productId ||
      line.material_status !== 1 ||
      line.material_is_deleted !== 0 ||
      line.material_item_kind !== 'material' ||
      line.category_status !== 1 ||
      line.category_is_deleted !== 0 ||
      line.unit_snapshot !== line.material_unit ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > 99_999_999
    ) {
      throw new ProductDomainError(
        'INVALID_MATERIAL',
        `BOM 第 ${line.line_no} 行物料不可用：物料必须为已启用的物料，且单位用量和单位快照必须与物料基础单位一致`,
      );
    }
  }

  private async requireMaterialCandidate(
    db: Db,
    productId: string,
    materialId: string,
  ): Promise<MaterialCandidateRow> {
    const [[row]] = await db.query<MaterialCandidateRow[]>(
      `SELECT p.id,p.item_code,p.product_name,p.unit,p.status,p.is_deleted,
              c.item_kind,c.status category_status,c.is_deleted category_is_deleted
         FROM products p
         JOIN product_categories c ON c.id = p.category_id
        WHERE p.id = ? AND p.is_deleted = 0`,
      [materialId],
    );
    if (!row) throw new ProductDomainError('INVALID_MATERIAL', 'BOM 投入物料不存在');
    if (
      materialId === productId ||
      row.status !== 1 ||
      row.item_kind !== 'material' ||
      row.category_status !== 1 ||
      row.category_is_deleted !== 0
    ) {
      throw new ProductDomainError(
        'INVALID_MATERIAL',
        'BOM 投入对象必须是已启用的物料，且不能引用产品自身',
      );
    }
    return row;
  }

  private async requireProduct(db: Db, productId: string, lock = false) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        status: number;
        acquire_method: 'self_made' | 'outsourced' | 'purchased';
        item_kind: 'material' | 'semi_finished' | 'finished_product';
        current_bom_version_id: number | null;
      })[]
    >(
      `SELECT p.id,p.status,p.acquire_method,c.item_kind,p.current_bom_version_id
         FROM products p JOIN product_categories c ON c.id = p.category_id
        WHERE p.id = ? AND p.is_deleted = 0${lock ? ' FOR UPDATE' : ''}`,
      [productId],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '产品或物料不存在');
    return row;
  }

  private async requireConfigurableProduct(db: Db, productId: string, lock = false) {
    const product = await this.requireProduct(db, productId, lock);
    requireConfigurableProduct({
      status: product.status,
      acquireMethod: product.acquire_method,
      itemKind: product.item_kind,
    });
    return product;
  }

  private async lockConfigurableVersion(connection: PoolConnection, bomVersionId: string) {
    const candidate = await this.findVersion(connection, bomVersionId);
    const product = await this.requireConfigurableProduct(
      connection,
      String(candidate.product_id),
      true,
    );
    const version = await this.findVersion(connection, bomVersionId, true);
    if (version.product_id !== product.id) {
      throw new ProductDomainError('CONFLICT', 'BOM 版本归属已变化，请刷新后重试');
    }
    return { version, product };
  }

  private async findDraftId(db: Db, productId: string): Promise<string | null> {
    const [[row]] = await db.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM product_bom_versions
        WHERE product_id = ? AND status = 'draft' AND is_deleted = 0
        ORDER BY id
        LIMIT 1
        FOR UPDATE`,
      [productId],
    );
    return row ? String(row.id) : null;
  }

  private async nextVersionNo(db: Db, productId: string): Promise<string> {
    const [rows] = await db.query<(RowDataPacket & { version_no: string })[]>(
      'SELECT version_no FROM product_bom_versions WHERE product_id = ?',
      [productId],
    );
    const majors = rows
      .map((row) => parseMajorVersion(row.version_no))
      .filter((value): value is number => value !== null);
    const nextMajor = majors.length ? Math.max(...majors) + 1 : 1;
    return `V${nextMajor}.0`;
  }

  private assertDraft(version: BomVersionRow): void {
    if (version.status !== 'draft')
      throw new ProductDomainError(
        'CONFLICT',
        '只有草稿 BOM 版本可以编辑、发布或删除；已发布版本永久只读',
      );
  }

  private toListItem(row: BomVersionListRow): ProductBomVersionListItem {
    return {
      id: String(row.id),
      productId: String(row.product_id),
      versionNo: row.version_no,
      status: row.status,
      lineCount: Number(row.line_count),
      isCurrent: row.is_current === 1,
      changeReason: row.change_reason,
      remark: row.remark,
      createdBy: row.created_by === null ? null : String(row.created_by),
      publishedBy: row.published_by === null ? null : String(row.published_by),
      publishedAt: date(row.published_at),
      createdAt: date(row.created_at),
      updatedAt: date(row.updated_at),
    };
  }

  private async audit(
    db: Db,
    audit: CommandContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ): Promise<void> {
    await writeTransactionalAudit(db, {
      logType: 'business',
      module: 'product',
      action,
      userId: audit.actorId,
      targetId,
      targetType: 'product-bom-version',
      result: 'success',
      beforeData,
      afterData,
      requestId: audit.requestId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
  }
}

const parseMajorVersion = (versionNo: string): number | null => {
  const match = /^V(\d+)(?:\.\d+)?$/.exec(versionNo);
  return match ? Number(match[1]) : null;
};

const date = (value: Date | null): string | null =>
  value === null ? null : toBeijingISOString(value);
