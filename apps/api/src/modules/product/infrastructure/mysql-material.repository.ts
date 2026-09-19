import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  MaterialListItem,
  MaterialListQuery,
  MaterialOption,
  MaterialPayload,
  MaterialVariantItem,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { MaterialRepository } from '../application/ports/material.repository.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { mapProductWriteError } from './mysql-product.shared.js';

type Db = Pool | PoolConnection;
type MaterialRow = RowDataPacket & {
  id: number;
  material_code: string;
  material_name: string;
  category_id: number;
  category_code: string;
  category_name: string;
  unit: string;
  acquire_method: MaterialListItem['acquireMethod'];
  spec_values: string | object | null;
  status: number;
  remark: string | null;
  updated_at: Date | null;
};
type VariantRow = RowDataPacket & {
  id: number;
  material_id: number;
  material_code: string;
  material_name: string;
  major_version: string;
  minor_version: string;
  variant_code: string;
  status: number;
  remark: string | null;
  updated_at: Date | null;
};

@Injectable()
export class MysqlMaterialRepository extends MaterialRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async list(query: MaterialListQuery): Promise<PageResult<MaterialListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['m.is_deleted=0', 'c.is_deleted=0', "c.item_kind='material'"];
    const parameters: Array<string | number> = [];
    if (query.keyword) {
      conditions.push(
        '(m.material_code LIKE ? OR m.material_name LIKE ? OR EXISTS (SELECT 1 FROM material_variants mv WHERE mv.material_id=m.id AND mv.is_deleted=0 AND mv.variant_code LIKE ?))',
      );
      const keyword = `%${query.keyword}%`;
      parameters.push(keyword, keyword, keyword);
    }
    if (query.categoryId) {
      conditions.push('m.category_id=?');
      parameters.push(query.categoryId);
    }
    if (query.acquireMethod) {
      conditions.push('m.acquire_method=?');
      parameters.push(query.acquireMethod);
    }
    if (query.status !== undefined) {
      conditions.push('m.status=?');
      parameters.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM materials m JOIN item_categories c ON c.id=m.category_id WHERE ${where}`,
      parameters,
    );
    const [materials] = await this.pool.query<MaterialRow[]>(
      `SELECT m.id,m.material_code,m.material_name,m.category_id,c.category_code,c.category_name,
              m.unit,m.acquire_method,m.spec_values,m.status,m.remark,m.updated_at
         FROM materials m JOIN item_categories c ON c.id=m.category_id
        WHERE ${where}
        ORDER BY m.material_code,m.id LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const materialIds = materials.map((item) => item.id);
    const variants = materialIds.length ? await this.variantsByMaterialIds(materialIds) : [];
    const variantsByMaterial = new Map<string, MaterialVariantItem[]>();
    for (const variant of variants) {
      const current = variantsByMaterial.get(variant.materialId) ?? [];
      current.push(variant);
      variantsByMaterial.set(variant.materialId, current);
    }
    return {
      items: materials.map((row) => {
        const itemVariants = variantsByMaterial.get(String(row.id)) ?? [];
        return {
          id: String(row.id),
          materialCode: row.material_code,
          materialName: row.material_name,
          categoryId: String(row.category_id),
          categoryCode: row.category_code,
          categoryName: row.category_name,
          unit: row.unit,
          acquireMethod: row.acquire_method,
          specValues: this.json<MaterialListItem['specValues'][number]>(row.spec_values),
          status: row.status,
          variantCount: itemVariants.length,
          variants: itemVariants,
          remark: row.remark,
          updatedAt: this.date(row.updated_at),
        };
      }),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async listOptions(): Promise<MaterialOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        material_code: string;
        material_name: string;
        acquire_method: MaterialOption['acquireMethod'];
        unit: string;
      })[]
    >(`SELECT m.id,m.material_code,m.material_name,m.acquire_method,m.unit
         FROM materials m JOIN item_categories c ON c.id=m.category_id
        WHERE m.status=1 AND m.is_deleted=0 AND c.status=1 AND c.is_deleted=0 AND c.item_kind='material'
        ORDER BY m.material_code,m.id`);
    return rows.map((row) => ({
      id: String(row.id),
      materialCode: row.material_code,
      materialName: row.material_name,
      acquireMethod: row.acquire_method,
      unit: row.unit,
    }));
  }

  async create(payload: MaterialPayload, audit: CommandContext) {
    return withTransaction(this.pool, async (connection) => {
      await this.requireMaterialCategory(connection, payload.categoryId);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO materials
          (material_code,material_name,category_id,unit,acquire_method,spec_values,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          payload.materialCode,
          payload.materialName,
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
      await this.audit(
        connection,
        audit,
        'material.create',
        String(result.insertId),
        null,
        payload,
      );
      return { id: String(result.insertId) };
    }).catch((error) => mapProductWriteError(error, '物料编码已存在，软删除记录的编码也不能复用'));
  }

  async update(id: string, payload: MaterialPayload, audit: CommandContext): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.record(connection, id, true);
      if (payload.materialCode !== before.material_code)
        throw new ProductDomainError('CONFLICT', '物料编码创建后不可修改；原则变化请新建物料');
      if (payload.unit !== before.unit)
        throw new ProductDomainError('CONFLICT', '物料基础单位创建后不可修改；原则变化请新建物料');
      await this.requireMaterialCategory(connection, payload.categoryId);
      await connection.execute(
        `UPDATE materials SET material_name=?,category_id=?,acquire_method=?,spec_values=?,status=?,remark=?,updated_by=?
          WHERE id=? AND is_deleted=0`,
        [
          payload.materialName,
          payload.categoryId,
          payload.acquireMethod,
          JSON.stringify(payload.specValues ?? []),
          payload.status,
          payload.remark ?? null,
          audit.actorId,
          id,
        ],
      );
      await this.audit(connection, audit, 'material.update', id, before, payload);
    }).catch((error) => mapProductWriteError(error, '物料编码已存在，软删除记录的编码也不能复用'));
  }

  async setStatus(id: string, status: number, audit: CommandContext): Promise<void> {
    if (status !== 0 && status !== 1)
      throw new ProductDomainError('INVALID_INPUT', '物料状态不合法');
    await withTransaction(this.pool, async (connection) => {
      const before = await this.record(connection, id, true);
      await connection.execute(
        'UPDATE materials SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.actorId, id],
      );
      await this.audit(
        connection,
        audit,
        'material.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }

  private async variantsByMaterialIds(materialIds: number[]): Promise<MaterialVariantItem[]> {
    const [rows] = await this.pool.query<VariantRow[]>(
      `SELECT v.id,v.material_id,m.material_code,m.material_name,v.major_version,v.minor_version,
              v.variant_code,v.status,v.remark,v.updated_at
         FROM material_variants v JOIN materials m ON m.id=v.material_id
        WHERE v.is_deleted=0 AND v.material_id IN (${materialIds.map(() => '?').join(',')})
        ORDER BY v.material_id,v.major_version,v.minor_version,v.id`,
      materialIds,
    );
    return rows.map((row) => ({
      id: String(row.id),
      materialId: String(row.material_id),
      materialCode: row.material_code,
      materialName: row.material_name,
      majorVersion: row.major_version,
      minorVersion: row.minor_version,
      variantCode: row.variant_code,
      status: row.status,
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
  }

  private async record(db: Db, id: string, lock = false) {
    const [[row]] = await db.query<
      (RowDataPacket & { material_code: string; unit: string; status: number })[]
    >(
      `SELECT material_code,unit,status FROM materials WHERE id=? AND is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '基础物料不存在');
    return row;
  }

  private async requireMaterialCategory(db: Db, id: string) {
    const [[row]] = await db.query<(RowDataPacket & { item_kind: string; status: number })[]>(
      'SELECT item_kind,status FROM item_categories WHERE id=? AND is_deleted=0',
      [id],
    );
    if (!row || row.status !== 1 || row.item_kind !== 'material')
      throw new ProductDomainError('INVALID_CATEGORY', '基础物料只能选择已启用的物料分类');
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
      targetType: 'material-master-data',
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
