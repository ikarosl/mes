import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { BomApprovalSnapshot, ProductItemKind } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { ProductDomainError } from '../domain/product.errors.js';
import {
  isEligibleBomMaterial,
  requireBomSubmissionProduct,
  requireBomSubmissionState,
  requireCurrentBomApproval,
} from '../domain/product-bom.policy.js';
import {
  productBomDefinition,
  readProductCatalogRecord,
  readProductSpecValues,
  requireProductCatalogCategory,
  writeProductCatalogAudit,
} from './mysql-product-catalog.persistence.js';

/** Product 所有的审批冻结、永久锁定和草稿恢复均复用原事务连接。 */
export class MysqlProductBomApproval {
  constructor(private readonly pool: Pool) {}

  async lockCurrentBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
  ): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const product = await readProductCatalogRecord(connection, productId, true);
      requireCurrentBomApproval(productBomDefinition(product), instanceId, expectedVersion);
    });
  }

  async prepareBomApproval(
    productId: string,
    expectedVersion: number,
    _audit: CommandContext,
  ): Promise<{ title: string; subjectVersion: number; snapshot: BomApprovalSnapshot }> {
    return withTransaction(this.pool, async (connection) => {
      const product = await readProductCatalogRecord(connection, productId, true);
      const definition = productBomDefinition(product);
      requireBomSubmissionState(definition);
      await requireProductCatalogCategory(connection, String(product.category_id));
      requireBomSubmissionProduct(definition, expectedVersion);
      const [rows] = await connection.query<
        (RowDataPacket & {
          id: number;
          material_id: number;
          item_code: string;
          quantity_per_unit: string;
          unit: string;
          remark: string | null;
          material_unit: string;
          material_status: number;
          material_is_deleted: number;
          item_kind: ProductItemKind;
          category_status: number;
          category_is_deleted: number;
        })[]
      >(
        `SELECT pm.id,pm.material_id,m.material_code item_code,pm.quantity_per_unit,pm.unit,
                pm.remark,m.unit material_unit,
                m.status material_status,m.is_deleted material_is_deleted,c.item_kind,
                c.status category_status,c.is_deleted category_is_deleted
           FROM product_materials pm
           JOIN materials m ON m.id=pm.material_id
           JOIN item_categories c ON c.id=m.category_id
          WHERE pm.product_id=? AND pm.status=1 AND pm.is_deleted=0
          ORDER BY pm.id FOR UPDATE`,
        [productId],
      );
      if (rows.length === 0)
        throw new ProductDomainError('INVALID_MATERIAL', 'BOM 至少需要一条有效物料明细');
      if (
        rows.some(
          (row) =>
            !isEligibleBomMaterial({
              materialStatus: row.material_status,
              isMaterialDeleted: row.material_is_deleted,
              itemKind: row.item_kind,
              categoryStatus: row.category_status,
              isCategoryDeleted: row.category_is_deleted,
              materialUnit: row.material_unit,
              bomUnit: row.unit,
            }),
        )
      )
        throw new ProductDomainError('INVALID_MATERIAL', 'BOM 包含不可用物料或用量单位不一致');
      const snapshot: BomApprovalSnapshot = {
        productId: String(product.id),
        itemCode: product.item_code,
        productName: product.product_name,
        unit: product.unit,
        specValues: readProductSpecValues<BomApprovalSnapshot['specValues'][number]>(
          product.spec_values,
        ),
        materials: rows.map((row) => ({
          id: String(row.id),
          materialId: String(row.material_id),
          itemCode: row.item_code,
          quantityPerUnit: String(row.quantity_per_unit),
          unit: row.unit,
          remark: row.remark,
        })),
      };
      return {
        title: `${product.item_code} BOM审批`,
        subjectVersion: product.version,
        snapshot,
      };
    });
  }

  async bindBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<number> {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products SET bom_status='pending_approval',bom_approval_instance_id=?,version=version+1,updated_by=?
          WHERE id=? AND is_deleted=0 AND bom_status='draft' AND bom_locked_at IS NULL AND version=?`,
        [instanceId, audit.actorId, productId, expectedVersion],
      );
      if (result.affectedRows !== 1)
        throw new ProductDomainError('CONFLICT', '产品资料已被其他操作修改，请刷新后重试');
      await writeProductCatalogAudit(
        connection,
        audit,
        'bom.submit',
        productId,
        { bomStatus: 'draft', version: expectedVersion },
        {
          bomStatus: 'pending_approval',
          approvalInstanceId: instanceId,
          version: expectedVersion + 1,
        },
      );
      return expectedVersion + 1;
    });
  }

  async finalizeBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const product = await readProductCatalogRecord(connection, productId, true);
      await requireProductCatalogCategory(connection, String(product.category_id));
      const [materials] = await connection.query<
        (RowDataPacket & {
          status: number;
          is_deleted: number;
          unit: string;
          bom_unit: string;
          category_status: number;
          category_deleted: number;
          item_kind: ProductItemKind;
        })[]
      >(
        `SELECT m.status,m.is_deleted,m.unit,pm.unit bom_unit,c.status category_status,c.is_deleted category_deleted,c.item_kind
         FROM product_materials pm JOIN materials m ON m.id=pm.material_id JOIN item_categories c ON c.id=m.category_id
         WHERE pm.product_id=? AND pm.status=1 AND pm.is_deleted=0 ORDER BY pm.material_id FOR UPDATE`,
        [productId],
      );
      if (
        !materials.length ||
        materials.some(
          (m) =>
            !isEligibleBomMaterial({
              materialStatus: m.status,
              isMaterialDeleted: m.is_deleted,
              itemKind: m.item_kind,
              categoryStatus: m.category_status,
              isCategoryDeleted: m.category_deleted,
              materialUnit: m.unit,
              bomUnit: m.bom_unit,
            }),
        )
      ) {
        throw new ProductDomainError(
          'INVALID_MATERIAL',
          'BOM 物料当前不可用，请先恢复有效资料或撤回申请',
        );
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products SET bom_status='approved',bom_locked_at=NOW(),bom_locked_by=?,version=version+1,updated_by=?
          WHERE id=? AND is_deleted=0 AND bom_status='pending_approval' AND bom_approval_instance_id=?
            AND bom_locked_at IS NULL AND version=?`,
        [audit.actorId, audit.actorId, productId, instanceId, expectedVersion],
      );
      if (result.affectedRows !== 1)
        throw new ProductDomainError('CONFLICT', 'BOM 当前状态已变化，不能完成审批');
      await writeProductCatalogAudit(
        connection,
        audit,
        'bom.approve',
        productId,
        { bomStatus: 'pending_approval', approvalInstanceId: instanceId, version: expectedVersion },
        { bomStatus: 'approved', approvalInstanceId: instanceId, bomLockedBy: audit.actorId },
      );
    });
  }

  async restoreBomAfterApprovalEnd(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,version=version+1,updated_by=?
          WHERE id=? AND is_deleted=0 AND bom_status='pending_approval' AND bom_approval_instance_id=?
            AND bom_locked_at IS NULL AND version=?`,
        [audit.actorId, productId, instanceId, expectedVersion],
      );
      if (result.affectedRows !== 1)
        throw new ProductDomainError('CONFLICT', 'BOM 当前状态已变化，不能恢复草稿');
      await writeProductCatalogAudit(
        connection,
        audit,
        'bom.approval-end',
        productId,
        { bomStatus: 'pending_approval', approvalInstanceId: instanceId, version: expectedVersion },
        { bomStatus: 'draft', version: expectedVersion + 1 },
      );
    });
  }
}
