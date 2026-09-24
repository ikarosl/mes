import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withActiveConnection, withTransaction } from '@company/database';
import type {
  MaterialOption,
  MaterialVariantItem,
  MaterialVariantListQuery,
  PageResult,
} from '@company/contracts';
import { MATERIAL_OPTIONS_WINDOW_SIZE } from '@company/constants';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductInventoryEligibility } from '../application/product-inventory-eligibility.query.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { requireEnabledCompatibleMaterialVariant } from '../domain/material-variant.policy.js';
import {
  MaterialVariantRepository,
  type CreateMaterialVariantCommand,
  type MaterialVariantRecord,
  type MaterialVariantDisplayReference,
} from '../application/ports/material-variant.repository.js';
import { mapProductWriteError } from './mysql-product.shared.js';

type Db = Pool | PoolConnection;
type VariantRow = RowDataPacket & {
  id: number;
  material_id: number;
  material_code: string;
  material_name: string;
  major_version: string;
  minor_version: string;
  variant_code: string;
  status: number;
  is_deleted: number;
  remark: string | null;
  updated_at: Date | null;
};

/**
 * MySQL adapter for the exact material-version master.
 *
 * `materials` stays the stable BOM identity. This adapter is the only Product
 * implementation that writes `material_variants`; Production consumes the
 * read-only capability exposed by Product public.ts. Variant code is generated
 * from immutable values and is never accepted as a client supplied field.
 */
@Injectable()
export class MysqlMaterialVariantRepository extends MaterialVariantRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly eligibility: ProductInventoryEligibility,
  ) {
    super();
  }

  async list(query: MaterialVariantListQuery): Promise<PageResult<MaterialVariantItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const { where, parameters } = this.filters(query);
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total
         FROM material_variants v
         JOIN materials p ON p.id=v.material_id
         JOIN item_categories c ON c.id=p.category_id
        WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<VariantRow[]>(
      `SELECT v.id,v.material_id,p.material_code,p.material_name,
              v.major_version,v.minor_version,v.variant_code,v.status,v.is_deleted,v.remark,v.updated_at
         FROM material_variants v
         JOIN materials p ON p.id=v.material_id
         JOIN item_categories c ON c.id=p.category_id
        WHERE ${where}
        ORDER BY p.material_code,v.major_version,v.minor_version,v.id
        LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map((row) => this.map(row)),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async listDisplayReferencesByIds(
    variantIds: string[],
  ): Promise<MaterialVariantDisplayReference[]> {
    if (variantIds.length === 0) return [];
    return withActiveConnection(this.pool, async (queryable) => {
      const [rows] = await queryable.query<
        (RowDataPacket & { id: number; variant_code: string })[]
      >(
        `SELECT id,variant_code FROM material_variants
          WHERE id IN (${variantIds.map(() => '?').join(',')}) ORDER BY id`,
        variantIds,
      );
      return rows.map((row) => ({ id: String(row.id), variantCode: row.variant_code }));
    });
  }

  async listPurchasableByMaterials(input: {
    materialIds: string[];
  }): Promise<MaterialVariantRecord[]> {
    const ids = [...new Set(input.materialIds)];
    if (!ids.length) return [];
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<VariantRow[]>(
        `SELECT v.id,v.material_id,p.material_code,p.material_name,
                v.major_version,v.minor_version,v.variant_code,v.status,v.is_deleted,v.remark,v.updated_at
           FROM material_variants v
           JOIN materials p ON p.id=v.material_id
           JOIN item_categories c ON c.id=p.category_id
          WHERE v.material_id IN (${ids.map(() => '?').join(',')})
            AND v.is_deleted=0 AND p.status=1 AND p.is_deleted=0
            AND c.status=1 AND c.is_deleted=0 AND c.item_kind='material'
          ORDER BY v.material_id,v.major_version,v.minor_version,v.id`,
        ids,
      );
      return rows.map((row) => this.toRecord(row));
    });
  }

  listProductionMaterials(input: {
    keyword?: string;
    includeIds?: string[];
  }): Promise<MaterialOption[]> {
    return this.listMaterialOptions(input, true);
  }

  listPurchasableMaterials(input: {
    keyword?: string;
    includeIds?: string[];
  }): Promise<MaterialOption[]> {
    return this.listMaterialOptions(input, false);
  }

  private async listMaterialOptions(
    input: { keyword?: string; includeIds?: string[] },
    enabledOnly: boolean,
  ): Promise<MaterialOption[]> {
    const includeIds = [...new Set(input.includeIds ?? [])];
    if (includeIds.length > 100) {
      throw new ProductDomainError('INVALID_INPUT', '回显物料最多 100 项');
    }
    return withActiveConnection(this.pool, async (db) => {
      type OptionRow = RowDataPacket & {
        id: number;
        material_code: string;
        material_name: string;
        acquire_method: MaterialOption['acquireMethod'];
        unit: string;
      };
      const base = `SELECT p.id,p.material_code,p.material_name,p.acquire_method,p.unit
          FROM materials p JOIN item_categories c ON c.id=p.category_id
         WHERE p.status=1 AND p.is_deleted=0 AND c.status=1 AND c.is_deleted=0
           AND c.item_kind='material'
           AND EXISTS (SELECT 1 FROM material_variants v WHERE v.material_id=p.id AND v.is_deleted=0${enabledOnly ? ' AND v.status=1' : ''})`;
      const keyword = input.keyword?.trim();
      const [window] = await db.query<OptionRow[]>(
        `${base}${keyword ? ' AND (p.material_code LIKE ? OR p.material_name LIKE ?)' : ''}
          ORDER BY p.material_code,p.id LIMIT ?`,
        [...(keyword ? [`%${keyword}%`, `%${keyword}%`] : []), MATERIAL_OPTIONS_WINDOW_SIZE],
      );
      const selected = includeIds.length
        ? (
            await db.query<OptionRow[]>(
              `${base} AND p.id IN (${includeIds.map(() => '?').join(',')}) ORDER BY p.material_code,p.id`,
              includeIds,
            )
          )[0]
        : [];
      return [
        ...new Map([...window, ...selected].map((row) => [String(row.id), row])).values(),
      ].map((row) => ({
        id: String(row.id),
        materialCode: row.material_code,
        materialName: row.material_name,
        acquireMethod: row.acquire_method,
        unit: row.unit,
      }));
    });
  }

  async listEnabledByMaterials(
    materialIds: string[],
    options: { lock?: boolean } = {},
  ): Promise<MaterialVariantRecord[]> {
    if (materialIds.length === 0) return [];
    return withActiveConnection(this.pool, async (queryable) => {
      const [rows] = await queryable.query<VariantRow[]>(
        `SELECT v.id,v.material_id,p.material_code,p.material_name,
                v.major_version,v.minor_version,v.variant_code,v.status,v.is_deleted,v.remark,v.updated_at
           FROM material_variants v
           JOIN materials p ON p.id=v.material_id
           JOIN item_categories c ON c.id=p.category_id
          WHERE v.material_id IN (${materialIds.map(() => '?').join(',')})
            AND v.status=1 AND v.is_deleted=0 AND p.status=1 AND p.is_deleted=0
            AND c.status=1 AND c.is_deleted=0 AND c.item_kind='material'
          ORDER BY v.material_id,v.major_version,v.minor_version,v.id`,
        materialIds,
      );
      if (options.lock) {
        // 显式先锁父身份，避免由 JOIN 的执行计划决定跨表锁序。
        const eligibility = await this.eligibility.requireProductionIssuableReferences({
          references: rows.map((row) => ({
            itemId: String(row.material_id),
            materialVariantId: String(row.id),
          })),
        });
        if (eligibility.status !== 'success') {
          throw new ProductDomainError('INVALID_INPUT', eligibility.message);
        }
      }
      return rows.map((row) => {
        requireEnabledCompatibleMaterialVariant(String(row.material_id), {
          id: String(row.id),
          materialId: String(row.material_id),
          status: row.status,
          isDeleted: row.is_deleted,
        });
        return this.toRecord(row);
      });
    });
  }

  private toRecord(row: VariantRow): MaterialVariantRecord {
    return {
      id: String(row.id),
      materialId: String(row.material_id),
      materialCode: row.material_code,
      materialName: row.material_name,
      majorVersion: row.major_version,
      minorVersion: row.minor_version,
      variantCode: row.variant_code,
      status: row.status,
      remark: row.remark,
      updatedAt: row.updated_at ? toBeijingISOString(row.updated_at) : null,
    };
  }

  async create(command: CreateMaterialVariantCommand, context: CommandContext) {
    const majorVersion = command.majorVersion.trim();
    const minorVersion = command.minorVersion.trim();
    if (!majorVersion || !minorVersion || majorVersion.length > 32 || minorVersion.length > 32) {
      throw new ProductDomainError('INVALID_INPUT', '物料版本号不能为空且长度不能超过 32 个字符');
    }
    return withTransaction(this.pool, async (connection) => {
      const [[material]] = await connection.query<
        (RowDataPacket & {
          id: number;
          material_code: string;
          status: number;
          is_deleted: number;
        })[]
      >(
        `SELECT p.id,p.material_code,p.status,p.is_deleted
           FROM materials p JOIN item_categories c ON c.id=p.category_id
          WHERE p.id=? AND p.is_deleted=0 FOR UPDATE`,
        [command.materialId],
      );
      if (!material) throw new ProductDomainError('NOT_FOUND', '基础物料不存在');
      if (material.status !== 1) {
        throw new ProductDomainError('INVALID_MATERIAL', '只有已启用的物料可以创建版本');
      }
      // The external code is deterministic and server-owned. Keep the base
      // code intact so all BOMs continue to resolve to the same material.
      const variantCode = `${material.material_code}-${majorVersion}-${minorVersion}`;
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO material_variants
          (material_id,major_version,minor_version,variant_code,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?)`,
        [
          command.materialId,
          majorVersion,
          minorVersion,
          variantCode,
          command.remark?.trim() || null,
          context.actorId,
          context.actorId,
        ],
      );
      await this.audit(
        connection,
        context,
        'material-variant.create',
        String(result.insertId),
        null,
        {
          materialId: command.materialId,
          majorVersion,
          minorVersion,
          variantCode,
        },
      );
      return { id: String(result.insertId), variantCode };
    }).catch((error) => mapProductWriteError(error, '该物料版本已存在，版本编码不能重复使用'));
  }

  async setStatus(id: string, status: number, context: CommandContext): Promise<void> {
    if (status !== 0 && status !== 1)
      throw new ProductDomainError('INVALID_INPUT', '物料版本状态不合法');
    await withTransaction(this.pool, async (connection) => {
      const [[before]] = await connection.query<VariantRow[]>(
        `SELECT id,status FROM material_variants WHERE id=? AND is_deleted=0 FOR UPDATE`,
        [id],
      );
      if (!before) throw new ProductDomainError('NOT_FOUND', '物料版本不存在');
      if (before.status === status) return;
      await connection.execute(
        'UPDATE material_variants SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, context.actorId, id],
      );
      await this.audit(
        connection,
        context,
        'material-variant.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }

  private filters(query: MaterialVariantListQuery) {
    const conditions = [
      'v.is_deleted=0',
      'p.is_deleted=0',
      'c.is_deleted=0',
      "c.item_kind='material'",
    ];
    const parameters: Array<string | number> = [];
    if (query.materialId) {
      conditions.push('v.material_id=?');
      parameters.push(query.materialId);
    }
    if (query.keyword) {
      conditions.push(
        '(p.material_code LIKE ? OR p.material_name LIKE ? OR v.variant_code LIKE ?)',
      );
      const keyword = `%${query.keyword}%`;
      parameters.push(keyword, keyword, keyword);
    }
    if (query.status !== undefined) {
      conditions.push('v.status=?');
      parameters.push(query.status);
    }
    return { where: conditions.join(' AND '), parameters };
  }

  private map(row: VariantRow): MaterialVariantItem {
    return {
      id: String(row.id),
      materialId: String(row.material_id),
      materialCode: row.material_code,
      materialName: row.material_name,
      majorVersion: row.major_version,
      minorVersion: row.minor_version,
      variantCode: row.variant_code,
      status: row.status,
      remark: row.remark,
      updatedAt: row.updated_at ? toBeijingISOString(row.updated_at) : null,
    };
  }

  private async audit(
    db: Db,
    context: CommandContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    await writeTransactionalAudit(db, {
      logType: 'business',
      module: 'product',
      action,
      userId: context.actorId,
      targetId,
      targetType: 'material-variant',
      result: 'success',
      beforeData,
      afterData,
      ip: context.ip,
      requestId: context.requestId,
      userAgent: context.userAgent,
    });
  }
}
