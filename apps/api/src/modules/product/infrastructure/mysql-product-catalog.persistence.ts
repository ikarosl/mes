import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ProductBomStatus, ProductItemKind, ProductListItem } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import type { ProductBomDefinition } from '../domain/product-bom.policy.js';
import { ProductDomainError } from '../domain/product.errors.js';

type Db = Pool | PoolConnection;

export interface ProductCatalogRecord extends RowDataPacket {
  id: number;
  item_code: string;
  product_name: string;
  category_id: number;
  item_kind: ProductItemKind;
  acquire_method: ProductListItem['acquireMethod'];
  status: number;
  default_route_id: number | null;
  unit: string;
  bom_locked_at: Date | null;
  bom_status: ProductBomStatus;
  bom_approval_instance_id: number | null;
  version: number;
  spec_values: string | object | null;
}

export async function readProductCatalogRecord(
  db: Db,
  id: string,
  lock = false,
): Promise<ProductCatalogRecord> {
  const [[row]] = await db.query<ProductCatalogRecord[]>(
    `SELECT p.id,p.item_code,p.product_name,p.category_id,c.item_kind,p.acquire_method,p.status,p.default_route_id,p.unit,p.bom_locked_at,p.bom_status,p.bom_approval_instance_id,p.version,p.spec_values
           FROM products p JOIN item_categories c ON c.id=p.category_id WHERE p.id=? AND p.is_deleted=0${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!row) throw new ProductDomainError('NOT_FOUND', '产品或物料不存在');
  return row;
}

export function productBomDefinition(record: ProductCatalogRecord): ProductBomDefinition {
  return {
    status: record.status,
    itemKind: record.item_kind,
    acquireMethod: record.acquire_method,
    version: record.version,
    bomStatus: record.bom_status,
    isBomLocked: record.bom_locked_at !== null,
    approvalInstanceId:
      record.bom_approval_instance_id === null ? null : String(record.bom_approval_instance_id),
  };
}

interface ProductCategoryRecord extends RowDataPacket {
  id: number;
  item_kind: ProductItemKind;
  status: number;
  category_code: string;
  category_name: string;
}

export async function requireProductCatalogCategory(
  db: Db,
  id: string,
): Promise<ProductCategoryRecord> {
  const [[row]] = await db.query<ProductCategoryRecord[]>(
    'SELECT id,item_kind,status,category_code,category_name FROM item_categories WHERE id=? AND is_deleted=0',
    [id],
  );
  if (!row) throw new ProductDomainError('NOT_FOUND', '产品分类不存在');
  if (row.status !== 1) {
    throw new ProductDomainError('INVALID_CATEGORY', '只能选择已启用的产品分类');
  }
  if (row.item_kind !== 'finished_product') {
    throw new ProductDomainError('INVALID_CATEGORY', '成品只能选择成品分类');
  }
  return row;
}

/** 只接收调用方当前事务，成功审计不能创建独立提交边界。 */
export async function writeProductCatalogAudit(
  db: PoolConnection,
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
    targetType: 'product-master-data',
    result: 'success',
    beforeData,
    afterData,
    ip: audit.ip,
    requestId: audit.requestId,
    userAgent: audit.userAgent,
  });
}

export function readProductSpecValues<T>(value: string | object | null): T[] {
  if (!value) return [];
  return (typeof value === 'string' ? JSON.parse(value) : value) as T[];
}
