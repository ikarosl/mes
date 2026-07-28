import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductDomainError } from '../domain/product.errors.js';
import type {
  ProcessRouteSnapshot,
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

@Injectable()
export class MysqlProductSnapshotRepository implements ProductSnapshotRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getProductionProduct(productId: string): Promise<ProductionProductSnapshot> {
    return this.productionProduct(productId);
  }

  async getBomSnapshot(productId: string) {
    const product = await this.productionProduct(productId);
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        material_product_id: number;
        item_code: string;
        product_name: string;
        unit: string;
        quantity_per_unit: string;
        is_key_material: number;
        need_batch_record: number;
      })[]
    >(
      `SELECT pm.material_product_id,p.item_code,p.product_name,pm.unit,pm.quantity_per_unit,
              pm.is_key_material,pm.need_batch_record
         FROM product_materials pm JOIN products p ON p.id=pm.material_product_id
        WHERE pm.product_id=? AND pm.status=1 AND pm.is_deleted=0 AND p.status=1 AND p.is_deleted=0
        ORDER BY pm.id`,
      [productId],
    );
    return {
      product,
      lines: rows.map((row) => ({
        materialProductId: String(row.material_product_id),
        itemCode: row.item_code,
        productName: row.product_name,
        unit: row.unit,
        quantityPerUnit: row.quantity_per_unit,
        isKeyMaterial: Boolean(row.is_key_material),
        needBatchRecord: Boolean(row.need_batch_record),
      })),
    };
  }

  async getRouteSnapshot(routeId: string): Promise<ProcessRouteSnapshot> {
    const [[route]] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        route_code: string;
        route_name: string;
        version_no: string;
        product_id: number;
      })[]
    >(
      `SELECT r.id,r.route_code,r.route_name,r.version_no,r.product_id
         FROM process_routes r JOIN products p ON p.id=r.product_id JOIN product_categories c ON c.id=p.category_id
        WHERE r.id=? AND r.status='enabled' AND r.is_deleted=0
          AND p.status=1 AND p.acquire_method='self_made' AND p.is_deleted=0 AND c.item_kind<>'material'`,
      [routeId],
    );
    if (!route) throw new ProductDomainError('NOT_FOUND', 'Enabled production route not found');
    const product = await this.productionProduct(String(route.product_id));
    const [steps] = await this.pool.query<
      (RowDataPacket & {
        step_order: number;
        process_step_id: number;
        step_code_snapshot: string;
        step_name_snapshot: string;
        description_snapshot: string | null;
        sop_file_id: number | null;
        sop_file_name_snapshot: string | null;
        sop_version_no: string | null;
        need_inspection: number;
        need_record: number;
      })[]
    >(
      `SELECT rs.step_order,rs.process_step_id,rs.step_code_snapshot,rs.step_name_snapshot,rs.description_snapshot,
              rs.sop_file_id,rs.sop_file_name_snapshot,tf.version_no sop_version_no,rs.need_inspection,rs.need_record
         FROM process_route_steps rs LEFT JOIN technical_files tf ON tf.id=rs.sop_file_id
        WHERE rs.route_id=? AND rs.status=1 AND rs.is_deleted=0
        ORDER BY rs.step_order`,
      [routeId],
    );
    if (steps.length === 0)
      throw new ProductDomainError('ROUTE_STEPS_REQUIRED', 'Enabled route has no active steps');
    return {
      id: String(route.id),
      routeCode: route.route_code,
      routeName: route.route_name,
      versionNo: route.version_no,
      product,
      steps: steps.map((step) => ({
        stepOrder: step.step_order,
        processStepId: String(step.process_step_id),
        stepCode: step.step_code_snapshot,
        stepName: step.step_name_snapshot,
        description: step.description_snapshot,
        sop:
          step.sop_file_id === null
            ? null
            : {
                id: String(step.sop_file_id),
                fileName: step.sop_file_name_snapshot ?? '',
                versionNo: step.sop_version_no ?? '',
              },
        needInspection: Boolean(step.need_inspection),
        needRecord: Boolean(step.need_record),
      })),
    };
  }

  private async productionProduct(productId: string): Promise<ProductionProductSnapshot> {
    const [[row]] = await this.pool.query<ProductRow[]>(
      `SELECT p.id,p.item_code,p.product_name,p.unit,p.default_route_id
         FROM products p JOIN product_categories c ON c.id=p.category_id
        WHERE p.id=? AND p.status=1 AND p.acquire_method='self_made' AND p.is_deleted=0 AND c.item_kind<>'material'`,
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
