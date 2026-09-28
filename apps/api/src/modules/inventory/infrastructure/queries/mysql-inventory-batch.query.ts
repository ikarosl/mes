import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  InventoryBatchTransactionItem,
  PageResult,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { InventoryDomainError } from '../../domain/inventory.errors.js';
import { fixedIntegerQuantity, integerQuantity } from '@company/utils';
import { currentMaterialNameSql } from './material-name.sql.js';
import type { MaterialVariantQuery } from '../../../product/public.js';

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
  inbound_detail_id: number;
  production_output_allocation_id: number | null;
  production_batch_id: number | null;
  work_order_id: number | null;
  procurement_receipt_line_id: number | null;
  procurement_receipt_revision_id: number | null;
  procurement_inspection_id: number | null;
  procurement_allocation_id: number | null;
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
const finishedNameSql = `(SELECT wo.product_name_snapshot FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id JOIN work_orders wo ON wo.id=o.work_order_id WHERE d.batch_id=ib.id AND o.status='completed' ORDER BY d.id LIMIT 1)`;
const displayNameSql = `CASE WHEN ib.product_id IS NULL THEN ${currentMaterialNameSql('ib.item_id')} ELSE ${finishedNameSql} END`;
const batchSourceSql = (columns: string): string => `SELECT ${columns} FROM item_batch ib`;

export async function listInventoryBatches(
  db: Db,
  query: InventoryBatchQuery,
  variants: MaterialVariantQuery,
): Promise<PageResult<InventoryBatchItem>> {
  const where = ['EXISTS (SELECT 1 FROM inventory_transaction it WHERE it.batch_id = ib.id)'];
  const params: Array<string | number> = [];
  if (query.itemKind)
    where.push(
      query.itemKind === 'material' ? 'ib.product_id IS NULL' : 'ib.product_id IS NOT NULL',
    );
  if (query.sourceType) {
    const sourceBatchIdsSql = `SELECT source_detail.batch_id FROM inbound_detail source_detail
      JOIN inbound_order source_order ON source_order.id=source_detail.inbound_id AND source_order.status='completed'
      LEFT JOIN production_output_allocation source_allocation ON source_allocation.id=source_detail.production_output_allocation_id
      WHERE COALESCE(source_allocation.category,source_order.source_type)=? OR source_order.source_type=?`;
    where.push(`ib.id IN (${sourceBatchIdsSql})`);
    params.push(query.sourceType, query.sourceType);
  }
  if (query.keyword) {
    const sourceKeywordBatchIdsSql = `SELECT source_detail.batch_id FROM inbound_detail source_detail
      JOIN inbound_order source_order ON source_order.id=source_detail.inbound_id AND source_order.status='completed'
      LEFT JOIN production_batches source_batch ON source_batch.id=source_order.production_batch_id
      LEFT JOIN work_orders source_work_order ON source_work_order.id=source_order.work_order_id
      WHERE source_batch.batch_no LIKE ? OR source_work_order.work_order_no LIKE ?`;
    where.push(
      `(ib.item_code_snapshot LIKE ? OR ${displayNameSql} LIKE ? OR ib.material_variant_code_snapshot LIKE ? OR ib.id IN (${sourceKeywordBatchIdsSql}))`,
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
    `${batchSourceSql('COUNT(*) total')} WHERE ${clause}`,
    params,
  );
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 20;
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `${batchSourceSql('ib.id')} WHERE ${clause} ORDER BY ib.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: await loadInventories(
      db,
      rows.map((row) => String(row.id)),
      variants,
    ),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
export async function getInventoryBatch(
  db: Db,
  id: string,
  variants: MaterialVariantQuery,
): Promise<InventoryBatchDetailItem> {
  const rows = await loadInventories(db, [id], variants);
  if (!rows[0]) throw new InventoryDomainError('NOT_FOUND', '库存批次不存在');
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
      quantity: String(row.quantity),
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
async function loadInventories(
  db: Db,
  ids: string[],
  variants: MaterialVariantQuery,
): Promise<InventoryBatchItem[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query<InventoryRow[]>(
    `SELECT ib.id,ib.item_id,ib.product_id,ib.material_variant_id,ib.item_code_snapshot,
     ib.material_variant_code_snapshot,ib.unit_snapshot,ib.batch_code,ib.source_type,source_summary.provider,
     ib.batch_status,source_summary.source_work_order_id,source_summary.source_production_batch_id,
     ${displayNameSql} item_name,source_order.work_order_no source_work_order_no,source_batch.batch_no source_production_batch_no,
     COALESCE(balance.current_quantity,0) on_hand,
     CASE WHEN ib.product_id IS NOT NULL THEN 0 ELSE COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number)
       FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0))
       FROM production_item_allocation a WHERE a.batch_id=ib.id AND a.item_id=ib.item_id AND a.material_variant_id=ib.material_variant_id AND a.allocation_status NOT IN ('released','cancelled')),0) END reserved
     FROM item_batch ib
     LEFT JOIN (SELECT d.batch_id,
       CASE WHEN COUNT(DISTINCT o.provider)=1 AND SUM(o.provider IS NULL)=0 THEN MIN(o.provider) ELSE NULL END provider,
       CASE WHEN COUNT(DISTINCT o.work_order_id)=1 AND SUM(o.work_order_id IS NULL)=0 THEN MIN(o.work_order_id) ELSE NULL END source_work_order_id,
       CASE WHEN COUNT(DISTINCT o.production_batch_id)=1 AND SUM(o.production_batch_id IS NULL)=0 THEN MIN(o.production_batch_id) ELSE NULL END source_production_batch_id
       FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id AND o.status='completed'
       JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
         AND t.batch_id=d.batch_id AND t.quantity=d.inbound_number AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status
         AND t.transaction_type IN ('purchase_inbound','production_inbound') AND t.quantity>0
         AND ((d.product_id IS NOT NULL AND t.product_id=d.product_id) OR (d.product_id IS NULL AND t.item_id=d.item_id AND t.material_variant_id=d.material_variant_id))
       WHERE d.batch_id IN (${placeholders}) GROUP BY d.batch_id) source_summary ON source_summary.batch_id=ib.id
     LEFT JOIN production_batches source_batch ON source_batch.id=source_summary.source_production_batch_id
     LEFT JOIN work_orders source_order ON source_order.id=source_summary.source_work_order_id
     LEFT JOIN inventory_batch_balance balance ON balance.batch_id=ib.id AND balance.stock_status='available'
     WHERE ib.id IN (${placeholders}) ORDER BY ib.id DESC`,
    [...ids, ...ids],
  );
  const [sources] = await db.query<SourceRow[]>(
    `SELECT d.batch_id,d.id inbound_detail_id,o.id inbound_id,o.inbound_no,o.provider,o.inbound_at,d.inbound_number,it.id transaction_id,COALESCE(a.category,o.source_type) source_type,r.id output_revision_id,r.revision_no output_revision_no,d.production_output_allocation_id,o.production_batch_id,o.work_order_id,d.procurement_receipt_line_id,d.procurement_receipt_revision_id,d.procurement_inspection_id,d.procurement_allocation_id
     FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id AND o.status='completed'
     JOIN inventory_transaction it ON it.reference_type='inbound_detail' AND it.reference_detail_id=d.id
       AND it.transaction_type IN ('purchase_inbound','production_inbound') AND it.quantity=d.inbound_number AND it.quantity>0
       AND it.batch_id=d.batch_id AND it.unit_snapshot=d.unit_snapshot AND it.stock_status=d.stock_status
       AND ((d.product_id IS NOT NULL AND it.product_id=d.product_id) OR (d.product_id IS NULL AND it.item_id=d.item_id AND it.material_variant_id=d.material_variant_id))
     LEFT JOIN production_output_allocation a ON a.id=d.production_output_allocation_id
     LEFT JOIN production_output_revision r ON r.id=a.revision_id
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
  const materialIds = [
    ...new Set(rows.flatMap((row) => (row.item_id === null ? [] : [String(row.item_id)]))),
  ];
  const eligibleVariants = new Set(
    (await variants.listEnabledByMaterials(materialIds)).map((variant) => variant.id),
  );
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
      row.product_id === null &&
        row.batch_status === 'available' &&
        eligibleVariants.has(String(row.material_variant_id))
        ? Math.max(0, integerQuantity(row.on_hand) - integerQuantity(row.reserved))
        : 0,
    ),
    sourceWorkOrderId: nullableId(row.source_work_order_id),
    sourceWorkOrderNo: row.source_work_order_no,
    sourceProductionBatchId: nullableId(row.source_production_batch_id),
    sourceProductionBatchNo: row.source_production_batch_no,
    inboundSources: (byBatch.get(String(row.id)) ?? []).map((source) => ({
      inboundDetailId: String(source.inbound_detail_id),
      inboundId: String(source.inbound_id),
      inboundNo: source.inbound_no,
      provider: source.provider,
      inboundAt: toBeijingISOString(source.inbound_at),
      inboundQuantity: String(source.inbound_number),
      inventoryTransactionId: String(source.transaction_id),
      sourceType: source.source_type,
      outputRevisionId: nullableId(source.output_revision_id),
      outputRevisionNo: source.output_revision_no,
      productionOutputAllocationId: nullableId(source.production_output_allocation_id),
      productionBatchId: nullableId(source.production_batch_id),
      workOrderId: nullableId(source.work_order_id),
      procurementReceiptLineId: nullableId(source.procurement_receipt_line_id),
      procurementReceiptRevisionId: nullableId(source.procurement_receipt_revision_id),
      procurementInspectionId: nullableId(source.procurement_inspection_id),
      procurementAllocationId: nullableId(source.procurement_allocation_id),
    })),
  }));
}
const nullableId = (value: number | null): string | null => (value === null ? null : String(value));
