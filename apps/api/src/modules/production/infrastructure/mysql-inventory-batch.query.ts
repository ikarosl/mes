import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  InventoryBatchTransactionItem,
  PageResult,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { fixedIntegerQuantity, integerQuantity } from '../domain/integer-quantity.js';
import { currentMaterialNameSql } from './queries/material-name.sql.js';

type Db = Pool | PoolConnection;
type InventoryRow = RowDataPacket & {
  id: number;
  item_id: number | null;
  product_id: number | null;
  material_variant_id: number | null;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string | null;
  unit_snapshot: string;
  batch_code: string;
  source_type: InventoryBatchItem['sourceType'];
  provider: string | null;
  batch_status: InventoryBatchItem['batchStatus'];
  source_work_order_id: number | null;
  source_work_order_no: string | null;
  source_production_batch_id: number | null;
  source_production_batch_no: string | null;
  on_hand: string;
  reserved: string;
};
type SourceRow = RowDataPacket & {
  batch_id: number;
  inbound_id: number;
  inbound_no: string;
  provider: string | null;
  inbound_at: Date;
  inbound_number: string;
  transaction_id: number;
  source_type: InventoryBatchItem['sourceType'];
  output_revision_id: number | null;
  output_revision_no: number | null;
};
type TransactionRow = RowDataPacket & {
  id: number;
  transaction_type: InventoryBatchTransactionItem['transactionType'];
  quantity: string;
  unit_snapshot: string;
  stock_status: InventoryBatchTransactionItem['stockStatus'];
  reference_type: InventoryBatchTransactionItem['referenceType'];
  reference_detail_id: number;
  transaction_group_key: string | null;
  reversal_of_transaction_id: number | null;
  remark: string | null;
  created_at: Date;
};
// 成品名称使用 Production 已冻结的来源工单名称；物料继续读当前名称，不跨模块读取 products。
const displayNameSql = `CASE WHEN ib.product_id IS NULL THEN ${currentMaterialNameSql('ib.item_id')} ELSE source_order.product_name_snapshot END`;
const batchSourceSql = `FROM item_batch ib
  LEFT JOIN production_batches source_batch ON source_batch.id=ib.source_production_batch_id
  LEFT JOIN work_orders source_order ON source_order.id=source_batch.work_order_id`;

export async function listInventoryBatches(
  db: Db,
  query: InventoryBatchQuery,
): Promise<PageResult<InventoryBatchItem>> {
  const where = ['EXISTS (SELECT 1 FROM inventory_transaction it WHERE it.batch_id = ib.id)'];
  const params: Array<string | number> = [];
  if (query.itemKind)
    where.push(
      query.itemKind === 'material' ? 'ib.product_id IS NULL' : 'ib.product_id IS NOT NULL',
    );
  if (query.sourceType) {
    where.push('ib.source_type=?');
    params.push(query.sourceType);
  }
  if (query.keyword) {
    where.push(
      `(ib.item_code_snapshot LIKE ? OR ${displayNameSql} LIKE ? OR ib.material_variant_code_snapshot LIKE ? OR source_batch.batch_no LIKE ? OR source_order.work_order_no LIKE ?)`,
    );
    params.push(...Array<string>(5).fill(`%${query.keyword}%`));
  }
  if (query.batchCode) {
    where.push('ib.batch_code LIKE ?');
    params.push(`%${query.batchCode}%`);
  }
  if (query.batchStatus) {
    where.push('ib.batch_status=?');
    params.push(query.batchStatus);
  }
  const clause = where.join(' AND ');
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total ${batchSourceSql} WHERE ${clause}`,
    params,
  );
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 20;
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT ib.id ${batchSourceSql} WHERE ${clause} ORDER BY ib.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: await loadInventories(
      db,
      rows.map((row) => String(row.id)),
    ),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
export async function getInventoryBatch(db: Db, id: string): Promise<InventoryBatchDetailItem> {
  const rows = await loadInventories(db, [id]);
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '库存批次不存在');
  const [transactions] = await db.query<TransactionRow[]>(
    `SELECT id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,transaction_group_key,reversal_of_transaction_id,remark,created_at
     FROM inventory_transaction WHERE batch_id=? ORDER BY created_at DESC,id DESC`,
    [id],
  );
  return {
    ...rows[0],
    inventoryTransactions: transactions.map((row) => ({
      inventoryTransactionId: String(row.id),
      transactionType: row.transaction_type,
      quantity: row.quantity,
      unit: row.unit_snapshot,
      stockStatus: row.stock_status,
      referenceType: row.reference_type,
      referenceDetailId: String(row.reference_detail_id),
      transactionGroupKey: row.transaction_group_key,
      reversalOfInventoryTransactionId: nullableId(row.reversal_of_transaction_id),
      remark: row.remark,
      transactionAt: toBeijingISOString(row.created_at),
    })),
  };
}
async function loadInventories(db: Db, ids: string[]): Promise<InventoryBatchItem[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query<InventoryRow[]>(
    `SELECT ib.*,${displayNameSql} item_name,source_order.work_order_no source_work_order_no,source_batch.batch_no source_production_batch_no,
     COALESCE(balance.current_quantity,0) on_hand,
     CASE WHEN ib.product_id IS NOT NULL THEN 0 ELSE COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number)
       FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0))
       FROM production_item_allocation a WHERE a.batch_id=ib.id AND a.item_id=ib.item_id AND a.material_variant_id=ib.material_variant_id AND a.allocation_status NOT IN ('released','cancelled')),0) END reserved
     ${batchSourceSql} LEFT JOIN inventory_batch_balance balance ON balance.batch_id=ib.id AND balance.stock_status='available'
     WHERE ib.id IN (${placeholders}) ORDER BY ib.id DESC`,
    ids,
  );
  const [sources] = await db.query<SourceRow[]>(
    `SELECT d.batch_id,o.id inbound_id,o.inbound_no,o.provider,o.inbound_at,d.inbound_number,it.id transaction_id,o.source_type,o.output_revision_id,r.revision_no output_revision_no
     FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id AND o.status='completed'
     JOIN inventory_transaction it ON it.reference_type='inbound_detail' AND it.reference_detail_id=d.id
       AND it.transaction_type IN ('purchase_inbound','production_inbound') AND it.quantity>0
     LEFT JOIN production_output_revision r ON r.id=o.output_revision_id
     WHERE d.batch_id IN (${placeholders}) ORDER BY d.batch_id,d.id`,
    ids,
  );
  const byBatch = new Map<string, SourceRow[]>();
  for (const source of sources) {
    const key = String(source.batch_id);
    const items = byBatch.get(key) ?? [];
    items.push(source);
    byBatch.set(key, items);
  }
  return rows.map((row) => ({
    itemBatchId: String(row.id),
    itemKind: row.product_id === null ? 'material' : 'finished_product',
    itemId: nullableId(row.item_id),
    productId: nullableId(row.product_id),
    materialVariantId: nullableId(row.material_variant_id),
    materialVariantCode: row.material_variant_code_snapshot,
    itemCode: row.item_code_snapshot,
    itemName: row.item_name,
    unit: row.unit_snapshot,
    batchCode: row.batch_code,
    sourceType: row.source_type,
    provider: row.provider,
    batchStatus: row.batch_status,
    onHandAvailableQuantity: fixedIntegerQuantity(row.on_hand),
    reservedQuantity: fixedIntegerQuantity(row.reserved),
    availableToAllocateQuantity: fixedIntegerQuantity(
      row.product_id === null
        ? Math.max(0, integerQuantity(row.on_hand) - integerQuantity(row.reserved))
        : 0,
    ),
    sourceWorkOrderId: nullableId(row.source_work_order_id),
    sourceWorkOrderNo: row.source_work_order_no,
    sourceProductionBatchId: nullableId(row.source_production_batch_id),
    sourceProductionBatchNo: row.source_production_batch_no,
    inboundSources: (byBatch.get(String(row.id)) ?? []).map((source) => ({
      inboundId: String(source.inbound_id),
      inboundNo: source.inbound_no,
      provider: source.provider,
      inboundAt: toBeijingISOString(source.inbound_at),
      inboundQuantity: source.inbound_number,
      inventoryTransactionId: String(source.transaction_id),
      sourceType: source.source_type,
      outputRevisionId: nullableId(source.output_revision_id),
      outputRevisionNo: source.output_revision_no,
    })),
  }));
}
const nullableId = (value: number | null): string | null => (value === null ? null : String(value));
