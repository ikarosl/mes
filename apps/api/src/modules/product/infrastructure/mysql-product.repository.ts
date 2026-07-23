import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ProcessRouteListItem,
  ProcessRoutePayload,
  ProcessRouteStatus,
  ProcessRouteStepItem,
  ProcessRouteStepPayload,
  ProcessStepListItem,
  ProcessStepPayload,
  ProductCategoryListItem,
  ProductCategoryPayload,
  ProductItemKind,
  ProductListItem,
  ProductMaterialItem,
  ProductMaterialPayload,
  ProductOption,
  ProductPayload,
  UserOption,
} from '@company/contracts';
import { withTransaction } from '@company/database';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type { AuditContext } from '../../identity/application/audit.types.js';
import { ProductDomainError } from '../domain/product.errors.js';
import {
  ProductRepository,
  type StoredTechnicalFile,
} from '../application/ports/product.repository.js';

type Db = Pool | PoolConnection;
type EntityRow = RowDataPacket & { id: number; status?: number | string; is_deleted?: number };

@Injectable()
export class MysqlProductRepository implements ProductRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listCategories(): Promise<ProductCategoryListItem[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        parent_id: number | null;
        category_code: string;
        category_name: string;
        item_kind: ProductItemKind;
        status: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(`SELECT id,parent_id,category_code,category_name,item_kind,status,remark,updated_at
             FROM product_categories WHERE is_deleted=0 ORDER BY item_kind,category_code`);
    return rows.map((row) => ({
      id: String(row.id),
      parentId: row.parent_id === null ? null : String(row.parent_id),
      categoryCode: row.category_code,
      categoryName: row.category_name,
      itemKind: row.item_kind,
      status: row.status,
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
  }

  async createCategory(payload: ProductCategoryPayload, audit: AuditContext) {
    return withTransaction(this.pool, async (connection) => {
      await this.validateCategoryParent(connection, payload.parentId ?? null, payload.itemKind);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO product_categories (parent_id,category_code,category_name,item_kind,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          payload.parentId ?? null,
          payload.categoryCode,
          payload.categoryName,
          payload.itemKind,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          audit.userId,
        ],
      );
      await this.audit(
        connection,
        audit,
        'category.create',
        String(result.insertId),
        null,
        payload,
      );
      return { id: String(result.insertId) };
    });
  }

  async updateCategory(id: string, payload: ProductCategoryPayload, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.categoryRecord(connection, id);
      if (payload.parentId === id)
        throw new ProductDomainError('INVALID_CATEGORY', '分类不能将自身设为父分类');
      await this.validateCategoryParent(connection, payload.parentId ?? null, payload.itemKind);
      if (payload.parentId) {
        const [cycle] = await connection.query<RowDataPacket[]>(
          `WITH RECURSIVE ancestors AS (
             SELECT id,parent_id FROM product_categories WHERE id=? AND is_deleted=0
             UNION ALL
             SELECT pc.id,pc.parent_id FROM product_categories pc JOIN ancestors a ON pc.id=a.parent_id WHERE pc.is_deleted=0
           ) SELECT id FROM ancestors WHERE id=? LIMIT 1`,
          [payload.parentId, id],
        );
        if (cycle.length)
          throw new ProductDomainError(
            'INVALID_CATEGORY',
            '父分类不能指向当前分类的下级，避免形成循环',
          );
      }
      const [[usage]] = await connection.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM products WHERE category_id=? AND is_deleted=0',
        [id],
      );
      if ((usage?.count ?? 0) > 0 && before.item_kind !== payload.itemKind) {
        throw new ProductDomainError('INVALID_CATEGORY', '已被产品使用的分类不能修改对象类型');
      }
      await connection.execute(
        `UPDATE product_categories SET parent_id=?,category_code=?,category_name=?,item_kind=?,status=?,remark=?,updated_by=? WHERE id=? AND is_deleted=0`,
        [
          payload.parentId ?? null,
          payload.categoryCode,
          payload.categoryName,
          payload.itemKind,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          id,
        ],
      );
      await this.audit(connection, audit, 'category.update', id, before, payload);
    });
  }

  async setCategoryStatus(id: string, status: number, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.categoryRecord(connection, id);
      await connection.execute(
        'UPDATE product_categories SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.userId, id],
      );
      await this.audit(
        connection,
        audit,
        'category.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }

  async listProducts(): Promise<ProductListItem[]> {
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
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(`SELECT p.id,p.item_code,p.product_name,p.category_id,c.category_code,c.category_name,c.item_kind,
                    p.default_route_id,r.route_name default_route_name,p.unit,p.acquire_method,p.spec_values,p.status,
                    COUNT(pm.id) material_count,p.remark,p.updated_at
             FROM products p JOIN product_categories c ON c.id=p.category_id
             LEFT JOIN process_routes r ON r.id=p.default_route_id AND r.is_deleted=0
             LEFT JOIN product_materials pm ON pm.product_id=p.id AND pm.is_deleted=0 AND pm.status=1
             WHERE p.is_deleted=0 GROUP BY p.id,c.category_code,c.category_name,c.item_kind,r.route_name ORDER BY p.id DESC`);
    return rows.map((row) => ({
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
      specValues: this.json(row.spec_values),
      status: row.status,
      materialCount: Number(row.material_count),
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
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
      })[]
    >(`SELECT p.id,p.item_code,p.product_name,c.item_kind,p.acquire_method,p.unit
             FROM products p JOIN product_categories c ON c.id=p.category_id
             WHERE p.is_deleted=0 AND p.status=1 AND c.is_deleted=0 AND c.status=1 ORDER BY p.item_code`);
    return rows.map((row) => ({
      id: String(row.id),
      itemCode: row.item_code,
      productName: row.product_name,
      itemKind: row.item_kind,
      acquireMethod: row.acquire_method,
      unit: row.unit,
    }));
  }

  async createProduct(payload: ProductPayload, audit: AuditContext) {
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
          audit.userId,
          audit.userId,
        ],
      );
      await this.audit(connection, audit, 'product.create', String(result.insertId), null, payload);
      return { id: String(result.insertId) };
    });
  }

  async updateProduct(id: string, payload: ProductPayload, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.productRecord(connection, id);
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
          audit.userId,
          id,
        ],
      );
      await this.audit(connection, audit, 'product.update', id, before, payload);
    });
  }

  async setProductStatus(id: string, status: number, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.productRecord(connection, id);
      await connection.execute(
        'UPDATE products SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.userId, id],
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

  async replaceMaterials(productId: string, items: ProductMaterialPayload[], audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const product = await this.productRecord(connection, productId, true);
      if (product.acquire_method !== 'self_made' || product.item_kind === 'material') {
        throw new ProductDomainError('INVALID_PRODUCT_KIND', '只有自制半成品或成品可以配置 BOM');
      }
      const before = await this.listMaterialRecords(connection, productId);
      const desiredIds = items.map((item) => item.materialProductId);
      for (const item of items)
        await this.requireMaterialCandidate(connection, productId, item.materialProductId);
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
        [audit.userId, audit.userId, productId],
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
            audit.userId,
            audit.userId,
          ],
        );
      }
      await this.audit(connection, audit, 'bom.replace', productId, before, items);
    });
  }

  async setDefaultRoute(productId: string, routeId: string | null, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const product = await this.productRecord(connection, productId, true);
      if (product.acquire_method !== 'self_made' || product.item_kind === 'material') {
        throw new ProductDomainError(
          'INVALID_PRODUCT_KIND',
          '只有自制半成品或成品可以设置默认工艺路线',
        );
      }
      if (routeId) {
        const [[route]] = await connection.query<
          (RowDataPacket & { product_id: number; status: string })[]
        >('SELECT product_id,status FROM process_routes WHERE id=? AND is_deleted=0', [routeId]);
        if (!route || String(route.product_id) !== productId || route.status !== 'enabled') {
          throw new ProductDomainError('INVALID_ROUTE', '默认路线必须是该产品已启用的工艺路线');
        }
      }
      await connection.execute(
        'UPDATE products SET default_route_id=?,updated_by=? WHERE id=? AND is_deleted=0',
        [routeId, audit.userId, productId],
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

  async listProcessSteps(): Promise<ProcessStepListItem[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        step_code: string;
        step_name: string;
        description: string | null;
        default_sop_file_id: number | null;
        sop_file_name: string | null;
        status: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(`SELECT ps.id,ps.step_code,ps.step_name,ps.description,ps.default_sop_file_id,tf.file_name sop_file_name,
                    ps.status,ps.remark,ps.updated_at
             FROM process_steps ps LEFT JOIN technical_files tf ON tf.id=ps.default_sop_file_id AND tf.is_deleted=0
             WHERE ps.is_deleted=0 ORDER BY ps.step_code`);
    return rows.map((row) => ({
      id: String(row.id),
      stepCode: row.step_code,
      stepName: row.step_name,
      description: row.description,
      defaultSopFileId: row.default_sop_file_id === null ? null : String(row.default_sop_file_id),
      sopFileName: row.sop_file_name,
      status: row.status,
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
  }

  async createProcessStep(payload: ProcessStepPayload, audit: AuditContext) {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO process_steps (step_code,step_name,description,status,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?)`,
        [
          payload.stepCode,
          payload.stepName,
          payload.description ?? null,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          audit.userId,
        ],
      );
      await this.audit(
        connection,
        audit,
        'process-step.create',
        String(result.insertId),
        null,
        payload,
      );
      return { id: String(result.insertId) };
    });
  }

  async updateProcessStep(id: string, payload: ProcessStepPayload, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.processStepRecord(connection, id);
      await connection.execute(
        `UPDATE process_steps SET step_code=?,step_name=?,description=?,status=?,remark=?,updated_by=? WHERE id=? AND is_deleted=0`,
        [
          payload.stepCode,
          payload.stepName,
          payload.description ?? null,
          payload.status,
          payload.remark ?? null,
          audit.userId,
          id,
        ],
      );
      await this.audit(connection, audit, 'process-step.update', id, before, payload);
    });
  }

  async setProcessStepStatus(id: string, status: number, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.processStepRecord(connection, id);
      await connection.execute(
        'UPDATE process_steps SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.userId, id],
      );
      await this.audit(
        connection,
        audit,
        'process-step.status',
        id,
        { status: before.status },
        { status },
      );
    });
  }

  async attachProcessStepSop(id: string, file: StoredTechnicalFile, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.processStepRecord(connection, id);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO technical_files (file_name,original_name,storage_provider,bucket,object_key,mime_type,size_bytes,checksum_sha256,file_type,version_no,status,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        [
          file.fileName,
          file.originalName,
          file.storageProvider,
          file.bucket,
          file.objectKey,
          file.mimeType,
          file.sizeBytes,
          file.checksumSha256,
          file.fileType,
          file.versionNo,
          audit.userId,
          audit.userId,
        ],
      );
      await connection.execute(
        'UPDATE process_steps SET default_sop_file_id=?,updated_by=? WHERE id=? AND is_deleted=0',
        [result.insertId, audit.userId, id],
      );
      await this.audit(
        connection,
        audit,
        'process-step.upload-sop',
        id,
        { defaultSopFileId: before.default_sop_file_id },
        { defaultSopFileId: String(result.insertId), fileName: file.fileName },
      );
    });
  }

  async listRoutes(): Promise<ProcessRouteListItem[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        route_code: string;
        route_name: string;
        product_id: number;
        item_code: string;
        product_name: string;
        version_no: string;
        status: ProcessRouteStatus;
        process_summary: string | null;
        step_count: number;
        remark: string | null;
        updated_at: Date | null;
      })[]
    >(`SELECT r.id,r.route_code,r.route_name,r.product_id,p.item_code,p.product_name,r.version_no,r.status,
                    GROUP_CONCAT(CASE WHEN rs.is_deleted=0 THEN rs.step_name_snapshot END ORDER BY rs.step_order SEPARATOR ' → ') process_summary,
                    COUNT(CASE WHEN rs.is_deleted=0 THEN 1 END) step_count,r.remark,r.updated_at
             FROM process_routes r JOIN products p ON p.id=r.product_id
             LEFT JOIN process_route_steps rs ON rs.route_id=r.id
             WHERE r.is_deleted=0 GROUP BY r.id,p.item_code,p.product_name ORDER BY r.id DESC`);
    return rows.map((row) => ({
      id: String(row.id),
      routeCode: row.route_code,
      routeName: row.route_name,
      productId: String(row.product_id),
      itemCode: row.item_code,
      productName: row.product_name,
      versionNo: row.version_no,
      status: row.status,
      processSummary: row.process_summary,
      stepCount: Number(row.step_count),
      remark: row.remark,
      updatedAt: this.date(row.updated_at),
    }));
  }

  async createRoute(payload: ProcessRoutePayload, audit: AuditContext) {
    return withTransaction(this.pool, async (connection) => {
      await this.requireRoutableProduct(connection, payload.productId);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO process_routes (route_code,route_name,product_id,version_no,status,remark,created_by,updated_by) VALUES (?,?,?,?,'draft',?,?,?)`,
        [
          payload.routeCode,
          payload.routeName,
          payload.productId,
          payload.versionNo,
          payload.remark ?? null,
          audit.userId,
          audit.userId,
        ],
      );
      await this.audit(connection, audit, 'route.create', String(result.insertId), null, {
        ...payload,
        status: 'draft',
      });
      return { id: String(result.insertId) };
    });
  }

  async updateRoute(id: string, payload: ProcessRoutePayload, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.routeRecord(connection, id, true);
      if (before.status !== 'draft')
        throw new ProductDomainError(
          'IMMUTABLE_ROUTE',
          '路线启用后版本内容不可原地修改，请创建新版本',
        );
      await this.requireRoutableProduct(connection, payload.productId);
      if (String(before.product_id) !== payload.productId) {
        const [[steps]] = await connection.query<(RowDataPacket & { count: number })[]>(
          'SELECT COUNT(*) count FROM process_route_steps WHERE route_id=? AND is_deleted=0',
          [id],
        );
        if ((steps?.count ?? 0) > 0)
          throw new ProductDomainError('INVALID_ROUTE', '已有步骤的草稿路线不能更换所属产品');
      }
      await connection.execute(
        `UPDATE process_routes SET route_code=?,route_name=?,product_id=?,version_no=?,remark=?,updated_by=? WHERE id=? AND is_deleted=0`,
        [
          payload.routeCode,
          payload.routeName,
          payload.productId,
          payload.versionNo,
          payload.remark ?? null,
          audit.userId,
          id,
        ],
      );
      await this.audit(connection, audit, 'route.update', id, before, payload);
    });
  }

  async setRouteStatus(id: string, status: ProcessRouteStatus, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.routeRecord(connection, id, true);
      const current = before.status as ProcessRouteStatus;
      const allowed: Record<ProcessRouteStatus, ProcessRouteStatus[]> = {
        draft: ['enabled', 'archived'],
        enabled: ['disabled', 'archived'],
        disabled: ['enabled', 'archived'],
        archived: [],
      };
      if (status !== current && !allowed[current].includes(status)) {
        throw new ProductDomainError('INVALID_ROUTE', `工艺路线不能从 ${current} 变更为 ${status}`);
      }
      if (status === 'enabled') {
        await this.requireRoutableProduct(connection, String(before.product_id));
        const [[steps]] = await connection.query<(RowDataPacket & { count: number })[]>(
          'SELECT COUNT(*) count FROM process_route_steps WHERE route_id=? AND is_deleted=0 AND status=1',
          [id],
        );
        if ((steps?.count ?? 0) === 0)
          throw new ProductDomainError(
            'ROUTE_STEPS_REQUIRED',
            '路线至少配置一个启用工序后才能启用',
          );
      }
      await connection.execute(
        'UPDATE process_routes SET status=?,updated_by=? WHERE id=? AND is_deleted=0',
        [status, audit.userId, id],
      );
      await this.audit(connection, audit, 'route.status', id, { status: current }, { status });
    });
  }

  async deleteRoute(id: string, audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const before = await this.routeRecord(connection, id, true);
      if (before.status !== 'draft')
        throw new ProductDomainError('IMMUTABLE_ROUTE', '只有从未启用的草稿路线可以删除');
      await connection.execute(
        `DELETE rsm FROM route_step_materials rsm JOIN process_route_steps rs ON rs.id=rsm.route_step_id WHERE rs.route_id=?`,
        [id],
      );
      await connection.execute(
        'UPDATE process_route_steps SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE route_id=? AND is_deleted=0',
        [audit.userId, audit.userId, id],
      );
      await connection.execute(
        'UPDATE process_routes SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE id=? AND is_deleted=0',
        [audit.userId, audit.userId, id],
      );
      await this.audit(connection, audit, 'route.delete', id, before, null);
    });
  }

  async listRouteSteps(routeId: string): Promise<ProcessRouteStepItem[]> {
    await this.routeRecord(this.pool, routeId);
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        process_step_id: number;
        step_order: number;
        step_code_snapshot: string;
        step_name_snapshot: string;
        description_snapshot: string | null;
        default_owner_id: number | null;
        default_owner_name: string | null;
        sop_file_id: number | null;
        sop_file_name_snapshot: string | null;
        need_inspection: number;
        need_record: number;
        status: number;
        remark: string | null;
        product_material_ids: string | null;
      })[]
    >(
      `SELECT rs.id,rs.process_step_id,rs.step_order,rs.step_code_snapshot,rs.step_name_snapshot,rs.description_snapshot,
                    rs.default_owner_id,u.display_name default_owner_name,rs.sop_file_id,rs.sop_file_name_snapshot,
                    rs.need_inspection,rs.need_record,rs.status,rs.remark,GROUP_CONCAT(rsm.product_material_id ORDER BY rsm.product_material_id) product_material_ids
             FROM process_route_steps rs LEFT JOIN users u ON u.id=rs.default_owner_id
             LEFT JOIN route_step_materials rsm ON rsm.route_step_id=rs.id
             WHERE rs.route_id=? AND rs.is_deleted=0 GROUP BY rs.id,u.display_name ORDER BY rs.step_order`,
      [routeId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      processStepId: String(row.process_step_id),
      stepOrder: row.step_order,
      stepCode: row.step_code_snapshot,
      stepName: row.step_name_snapshot,
      description: row.description_snapshot,
      defaultOwnerId: row.default_owner_id === null ? null : String(row.default_owner_id),
      defaultOwnerName: row.default_owner_name,
      sopFileId: row.sop_file_id === null ? null : String(row.sop_file_id),
      sopFileName: row.sop_file_name_snapshot,
      needInspection: Boolean(row.need_inspection),
      needRecord: Boolean(row.need_record),
      status: row.status,
      remark: row.remark,
      productMaterialIds: row.product_material_ids?.split(',') ?? [],
    }));
  }

  async replaceRouteSteps(routeId: string, items: ProcessRouteStepPayload[], audit: AuditContext) {
    await withTransaction(this.pool, async (connection) => {
      const route = await this.routeRecord(connection, routeId, true);
      if (route.status !== 'draft')
        throw new ProductDomainError(
          'IMMUTABLE_ROUTE',
          '路线启用后步骤和 SOP 快照不可原地修改，请创建新版本',
        );
      const before = await this.listRouteStepRecords(connection, routeId);
      const snapshots: Array<
        ProcessRouteStepPayload & {
          stepCode: string;
          stepName: string;
          description: string | null;
          sopFileId: string | null;
          sopFileName: string | null;
          sopObjectKey: string | null;
        }
      > = [];
      for (const item of items) {
        const [[step]] = await connection.query<
          (RowDataPacket & {
            step_code: string;
            step_name: string;
            description: string | null;
            default_sop_file_id: number | null;
            sop_file_name: string | null;
            sop_object_key: string | null;
          })[]
        >(
          `SELECT ps.step_code,ps.step_name,ps.description,ps.default_sop_file_id,tf.file_name sop_file_name,tf.object_key sop_object_key
                FROM process_steps ps LEFT JOIN technical_files tf ON tf.id=COALESCE(?,ps.default_sop_file_id) AND tf.is_deleted=0 AND tf.status=1
                WHERE ps.id=? AND ps.is_deleted=0 AND ps.status=1`,
          [item.sopFileId ?? null, item.processStepId],
        );
        if (!step) throw new ProductDomainError('NOT_FOUND', '路线引用的工序不存在或已停用');
        if (item.defaultOwnerId) {
          const [[owner]] = await connection.query<EntityRow[]>(
            'SELECT id FROM users WHERE id=? AND status=1 AND deleted_at IS NULL',
            [item.defaultOwnerId],
          );
          if (!owner) throw new ProductDomainError('NOT_FOUND', '默认负责人不存在或已停用');
        }
        for (const materialId of item.productMaterialIds ?? []) {
          const [[material]] = await connection.query<EntityRow[]>(
            'SELECT id FROM product_materials WHERE id=? AND product_id=? AND status=1 AND is_deleted=0',
            [materialId, route.product_id],
          );
          if (!material)
            throw new ProductDomainError(
              'INVALID_MATERIAL',
              '路线步骤引用的 BOM 明细不属于该产品或已停用',
            );
        }
        snapshots.push({
          ...item,
          stepCode: step.step_code,
          stepName: step.step_name,
          description: step.description,
          sopFileId:
            item.sopFileId ??
            (step.default_sop_file_id === null ? null : String(step.default_sop_file_id)),
          sopFileName: step.sop_file_name,
          sopObjectKey: step.sop_object_key,
        });
      }
      const existingIds = before.map((item) => item.id);
      if (existingIds.length)
        await connection.query(
          `DELETE FROM route_step_materials WHERE route_step_id IN (${existingIds.map(() => '?').join(',')})`,
          existingIds,
        );
      await connection.execute(
        'UPDATE process_route_steps SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=? WHERE route_id=? AND is_deleted=0',
        [audit.userId, audit.userId, routeId],
      );
      for (const item of snapshots) {
        await connection.execute(
          `INSERT INTO process_route_steps (route_id,process_step_id,step_order,step_code_snapshot,step_name_snapshot,description_snapshot,default_owner_id,sop_file_id,sop_file_name_snapshot,sop_object_key_snapshot,need_inspection,need_record,status,remark,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE process_step_id=VALUES(process_step_id),step_code_snapshot=VALUES(step_code_snapshot),step_name_snapshot=VALUES(step_name_snapshot),
             description_snapshot=VALUES(description_snapshot),default_owner_id=VALUES(default_owner_id),sop_file_id=VALUES(sop_file_id),
             sop_file_name_snapshot=VALUES(sop_file_name_snapshot),sop_object_key_snapshot=VALUES(sop_object_key_snapshot),need_inspection=VALUES(need_inspection),
             need_record=VALUES(need_record),status=VALUES(status),remark=VALUES(remark),updated_by=VALUES(updated_by),is_deleted=0,deleted_by=NULL,deleted_at=NULL`,
          [
            routeId,
            item.processStepId,
            item.stepOrder,
            item.stepCode,
            item.stepName,
            item.description,
            item.defaultOwnerId || null,
            item.sopFileId,
            item.sopFileName,
            item.sopObjectKey,
            Number(item.needInspection),
            Number(item.needRecord),
            item.status ?? 1,
            item.remark ?? null,
            audit.userId,
            audit.userId,
          ],
        );
        const [[routeStep]] = await connection.query<EntityRow[]>(
          'SELECT id FROM process_route_steps WHERE route_id=? AND step_order=?',
          [routeId, item.stepOrder],
        );
        for (const materialId of item.productMaterialIds ?? []) {
          await connection.execute(
            'INSERT INTO route_step_materials (route_step_id,product_material_id,created_by) VALUES (?,?,?)',
            [routeStep!.id, materialId, audit.userId],
          );
        }
      }
      await this.audit(
        connection,
        audit,
        'route.steps.replace',
        routeId,
        before,
        snapshots.map(({ sopObjectKey: _secret, ...item }) => item),
      );
    });
  }

  async listUserOptions(): Promise<UserOption[]> {
    const [rows] = await this.pool.query<(RowDataPacket & { id: number; display_name: string })[]>(
      'SELECT id,display_name FROM users WHERE status=1 AND deleted_at IS NULL ORDER BY display_name',
    );
    return rows.map((row) => ({ id: String(row.id), displayName: row.display_name }));
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
  private async validateCategoryParent(db: Db, parentId: string | null, itemKind: ProductItemKind) {
    if (!parentId) return;
    const parent = await this.requireCategory(db, parentId);
    if (parent.item_kind !== itemKind)
      throw new ProductDomainError('INVALID_CATEGORY', '父子分类必须属于相同对象类型');
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
      })[]
    >(
      `SELECT p.id,p.item_code,p.product_name,p.category_id,c.item_kind,p.acquire_method,p.status,p.default_route_id
           FROM products p JOIN product_categories c ON c.id=p.category_id WHERE p.id=? AND p.is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '产品或物料不存在');
    return row;
  }
  private async requireRoutableProduct(db: Db, id: string) {
    const product = await this.productRecord(db, id);
    if (
      product.status !== 1 ||
      product.acquire_method !== 'self_made' ||
      product.item_kind === 'material'
    ) {
      throw new ProductDomainError(
        'INVALID_PRODUCT_KIND',
        '工艺路线只能绑定已启用的自制半成品或成品',
      );
    }
    return product;
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
  }
  private async processStepRecord(db: Db, id: string) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        step_code: string;
        step_name: string;
        status: number;
        default_sop_file_id: number | null;
      })[]
    >(
      'SELECT id,step_code,step_name,status,default_sop_file_id FROM process_steps WHERE id=? AND is_deleted=0',
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '标准工序不存在');
    return row;
  }
  private async routeRecord(db: Db, id: string, lock = false) {
    const [[row]] = await db.query<
      (RowDataPacket & {
        id: number;
        route_code: string;
        route_name: string;
        product_id: number;
        version_no: string;
        status: ProcessRouteStatus;
      })[]
    >(
      `SELECT id,route_code,route_name,product_id,version_no,status FROM process_routes WHERE id=? AND is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', '工艺路线不存在');
    return row;
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
  private async listRouteStepRecords(db: Db, routeId: string) {
    const [rows] = await db.query<
      (RowDataPacket & {
        id: number;
        process_step_id: number;
        step_order: number;
        step_code_snapshot: string;
        step_name_snapshot: string;
      })[]
    >(
      'SELECT id,process_step_id,step_order,step_code_snapshot,step_name_snapshot FROM process_route_steps WHERE route_id=? AND is_deleted=0 ORDER BY step_order',
      [routeId],
    );
    return rows;
  }
  private async audit(
    db: Db,
    audit: AuditContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    await db.execute(
      `INSERT INTO operation_logs (log_type,module,action,user_id,target_id,target_type,result,before_data,after_data,ip,remark)
       VALUES ('business','product',?,?,?,'product-master-data','success',?,?,?,?)`,
      [
        action,
        audit.userId,
        targetId,
        beforeData === null ? null : JSON.stringify(beforeData),
        afterData === null ? null : JSON.stringify(afterData),
        audit.ip,
        null,
      ],
    );
  }
  private date(value: Date | null) {
    return value ? value.toISOString() : null;
  }
  private json<T>(value: string | object | null): T[] {
    if (!value) return [];
    return (typeof value === 'string' ? JSON.parse(value) : value) as T[];
  }
}
