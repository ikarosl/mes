import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import type {
  ProcessRouteSnapshot,
  ProductBomSnapshot,
  ProductionProductSnapshot,
} from '../application/product-snapshot.query.js';
import { ProductSnapshotRepository } from '../application/ports/product-snapshot.repository.js';

type ProductRow = RowDataPacket & {
  id: number;
  item_code: string;
  product_name: string;
  unit: string;
  default_route_id: number | null;
};
type Db = Pool | PoolConnection;
type RouteRow = RowDataPacket & {
  id: number;
  route_code: string;
  route_name: string;
  version_no: string;
  product_id: number;
};
type RouteStepRow = RowDataPacket & {
  route_step_id: number;
  step_order: number;
  process_step_id: number;
  step_code_snapshot: string;
  step_name_snapshot: string;
  description_snapshot: string | null;
  default_owner_id: number | null;
  sop_file_id: number | null;
  sop_file_name_snapshot: string | null;
  sop_object_key_snapshot: string | null;
  sop_version_no: string | null;
  sop_status: number | null;
  sop_is_deleted: number | null;
  need_inspection: number;
  need_record: number;
};

@Injectable()
export class MysqlProductSnapshotRepository implements ProductSnapshotRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getProductionProduct(productId: string): Promise<ProductionProductSnapshot> {
    return this.productionProduct(this.pool, productId);
  }

  async getBomSnapshot(productId: string): Promise<ProductBomSnapshot> {
    return withTransaction(this.pool, async (connection) => {
      const product = await this.productionProduct(connection, productId);
      const [rows] = await connection.query<BomRow[]>(
        `SELECT pm.id product_material_id,pm.material_product_id,p.item_code,p.product_name,pm.unit,
                pm.quantity_per_unit,pm.is_key_material,pm.need_batch_record,p.status material_status,
                p.is_deleted material_is_deleted,c.status category_status,c.is_deleted category_is_deleted
           FROM product_materials pm JOIN products p ON p.id=pm.material_product_id
           JOIN product_categories c ON c.id=p.category_id
          WHERE pm.product_id=? AND pm.status=1 AND pm.is_deleted=0
          ORDER BY pm.id`,
        [productId],
      );
      if (
        rows.some(
          (row) =>
            row.material_status !== 1 ||
            row.material_is_deleted !== 0 ||
            row.category_status !== 1 ||
            row.category_is_deleted !== 0,
        )
      ) {
        throw new ProductDomainError(
          'INVALID_MATERIAL',
          'BOM contains a disabled or deleted material and cannot be used for production',
        );
      }
      return {
        product,
        lines: rows.map((row) => ({
          productMaterialId: String(row.product_material_id),
          materialProductId: String(row.material_product_id),
          itemCode: row.item_code,
          productName: row.product_name,
          unit: row.unit,
          quantityPerUnit: row.quantity_per_unit,
          isKeyMaterial: Boolean(row.is_key_material),
          needBatchRecord: Boolean(row.need_batch_record),
        })),
      };
    });
  }

  async getRouteSnapshot(routeId: string): Promise<ProcessRouteSnapshot> {
    return withTransaction(this.pool, async (connection) => {
      const [[route]] = await connection.query<RouteRow[]>(
        `SELECT r.id,r.route_code,r.route_name,r.version_no,r.product_id
         FROM process_routes r JOIN products p ON p.id=r.product_id JOIN product_categories c ON c.id=p.category_id
        WHERE r.id=? AND r.status='enabled' AND r.is_deleted=0
          AND p.status=1 AND p.acquire_method='self_made' AND p.is_deleted=0
          AND c.item_kind<>'material' AND c.status=1 AND c.is_deleted=0`,
        [routeId],
      );
      if (!route) throw new ProductDomainError('NOT_FOUND', 'Enabled production route not found');
      const product = await this.productionProduct(connection, String(route.product_id));
      const [steps] = await connection.query<RouteStepRow[]>(
        `SELECT rs.id route_step_id,rs.step_order,rs.process_step_id,rs.step_code_snapshot,rs.step_name_snapshot,
                rs.description_snapshot,rs.default_owner_id,rs.sop_file_id,rs.sop_file_name_snapshot,
                rs.sop_object_key_snapshot,tf.version_no sop_version_no,tf.status sop_status,
                tf.is_deleted sop_is_deleted,rs.need_inspection,rs.need_record
         FROM process_route_steps rs
         LEFT JOIN technical_files tf ON tf.id=rs.sop_file_id AND tf.file_type='sop'
        WHERE rs.route_id=? AND rs.status=1 AND rs.is_deleted=0
        ORDER BY rs.step_order`,
        [routeId],
      );
      if (steps.length === 0)
        throw new ProductDomainError('ROUTE_STEPS_REQUIRED', 'Enabled route has no active steps');
      if (
        steps.some(
          (step) =>
            step.sop_file_id !== null &&
            (!step.sop_file_name_snapshot ||
              !step.sop_object_key_snapshot ||
              !step.sop_version_no ||
              step.sop_status !== 1 ||
              step.sop_is_deleted !== 0),
        )
      ) {
        throw new ProductDomainError('NOT_FOUND', 'Route contains an unavailable SOP snapshot');
      }
      return {
        id: String(route.id),
        routeCode: route.route_code,
        routeName: route.route_name,
        versionNo: route.version_no,
        product,
        steps: steps.map((step) => ({
          routeStepId: String(step.route_step_id),
          stepOrder: step.step_order,
          processStepId: String(step.process_step_id),
          stepCode: step.step_code_snapshot,
          stepName: step.step_name_snapshot,
          description: step.description_snapshot,
          defaultOwnerId: step.default_owner_id === null ? null : String(step.default_owner_id),
          sop:
            step.sop_file_id === null
              ? null
              : {
                  id: String(step.sop_file_id),
                  fileName: step.sop_file_name_snapshot!,
                  objectKey: step.sop_object_key_snapshot!,
                  versionNo: step.sop_version_no!,
                },
          needInspection: Boolean(step.need_inspection),
          needRecord: Boolean(step.need_record),
        })),
      };
    });
  }

  private async productionProduct(db: Db, productId: string): Promise<ProductionProductSnapshot> {
    const [[row]] = await db.query<ProductRow[]>(
      `SELECT p.id,p.item_code,p.product_name,p.unit,p.default_route_id
         FROM products p JOIN product_categories c ON c.id=p.category_id
        WHERE p.id=? AND p.status=1 AND p.acquire_method='self_made' AND p.is_deleted=0
          AND c.item_kind<>'material' AND c.status=1 AND c.is_deleted=0`,
      [productId],
    );
    if (!row) throw new ProductDomainError('NOT_FOUND', 'Enabled production product not found');
    return {
      id: String(row.id),
      itemCode: row.item_code,
      productName: row.product_name,
      unit: row.unit,
      defaultRouteId: row.default_route_id === null ? null : String(row.default_route_id),
    };
  }
}

type BomRow = RowDataPacket & {
  product_material_id: number;
  material_product_id: number;
  item_code: string;
  product_name: string;
  unit: string;
  quantity_per_unit: string;
  is_key_material: number;
  need_batch_record: number;
  material_status: number;
  material_is_deleted: number;
  category_status: number;
  category_is_deleted: number;
};
