import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type {
  PageResult,
  StockDocumentDirection,
  StockDocumentLine,
  StockDocumentOrder,
  StockDocumentQuery,
  StockDocumentSourceType,
  StockDocumentSources,
} from '@company/contracts';
import { fixedIntegerQuantity } from '@company/utils';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import { StockDocumentQueryPort } from '../../application/ports/stock-document-query.port.js';
import { InventoryDomainError } from '../../domain/inventory.errors.js';
import { iso, placeholders } from '../mysql-inventory.shared.js';

type Db = Pool | PoolConnection;
type DbId = string | number;
type ParentRow = RowDataPacket & {
  id: DbId;
  order_no: string;
  item_kind: StockDocumentOrder['itemKind'];
  source_type: StockDocumentSourceType;
  status: StockDocumentOrder['status'];
  version: number;
  reason: string | null;
  remark: string | null;
  created_by: DbId;
  created_at: Date;
  operator_id: DbId | null;
  confirmed_at: Date | null;
  cancel_source: StockDocumentOrder['cancelSource'];
  cancel_reason: string | null;
  cancelled_by: DbId | null;
  cancelled_at: Date | null;
};
type DetailRow = RowDataPacket & {
  id: DbId;
  parent_id: DbId;
  line_no: number;
  item_id: DbId | null;
  material_variant_id: DbId | null;
  product_id: DbId | null;
  item_code: string;
  item_name: string;
  variant_code: string | null;
  unit_snapshot: string;
  quantity: string | number;
  target_mode: StockDocumentLine['targetMode'];
  new_batch_key: string | null;
  batch_id: DbId | null;
  batch_code: string | null;
  stock_status: 'available';
  remark: string | null;
  is_deleted: number;
  transaction_id: DbId | null;
  receipt_id: DbId | null;
  receipt_no: string | null;
  receipt_line_id: DbId | null;
  receipt_line_no: number | null;
  purchase_order_id: DbId | null;
  purchase_no: string | null;
  purchase_order_line_id: DbId | null;
  purchase_order_line_no: number | null;
  supplier_id: DbId | null;
  supplier_name: string | null;
  work_order_id: DbId | null;
  work_order_no: string | null;
  production_batch_id: DbId | null;
  batch_no: string | null;
  production_output_id: DbId | null;
  tracking_card_id: DbId | null;
  card_no: string | null;
  allocation_id: DbId | null;
  demand_id: DbId | null;
};

/** Direction only selects these fixed identifiers; HTTP input never becomes SQL identifiers. */
const metadata = {
  inbound: {
    order: 'inbound_order',
    detail: 'inbound_detail',
    parent: 'inbound_id',
    number: 'inbound_no',
    at: 'inbound_at',
    quantity: 'inbound_number',
    reference: 'inbound_detail',
  },
  outbound: {
    order: 'outbound_order',
    detail: 'outbound_detail',
    parent: 'outbound_id',
    number: 'outbound_no',
    at: 'outbound_at',
    quantity: 'outbound_number',
    reference: 'outbound_detail',
  },
} as const;

const parentColumns = (direction: StockDocumentDirection): string => {
  const m = metadata[direction];
  return `o.id,o.${m.number} order_no,o.item_kind,o.source_type,o.status,o.version,o.reason,o.remark,
    o.created_by,o.created_at,o.operator_id,o.${m.at} confirmed_at,
    ${direction === 'inbound' ? 'NULL' : 'o.cancel_source'} cancel_source,
    o.cancel_reason,o.cancelled_by,o.cancelled_at`;
};

const detailSelectSql = (direction: StockDocumentDirection, columns: string): string => {
  if (direction === 'inbound')
    return `SELECT ${columns}
  FROM inbound_detail d JOIN inbound_order document ON document.id=d.inbound_id
  LEFT JOIN item_batch b ON b.id=d.batch_id
  LEFT JOIN materials material ON material.id=d.item_id
  LEFT JOIN material_variants variant ON variant.id=d.material_variant_id
  LEFT JOIN products product ON product.id=d.product_id
  LEFT JOIN work_orders work_order ON work_order.id=document.work_order_id
  LEFT JOIN production_batches production_batch ON production_batch.id=document.production_batch_id
  LEFT JOIN procurement_receipt_line receipt_line ON receipt_line.id=d.procurement_receipt_line_id
  LEFT JOIN procurement_receipt receipt ON receipt.id=receipt_line.receipt_id
  LEFT JOIN procurement_order source_order ON source_order.id=receipt_line.purchase_order_id
  LEFT JOIN procurement_order_line source_line ON source_line.id=receipt_line.purchase_order_line_id
  LEFT JOIN production_tracking_output output ON output.id=d.production_output_id
  LEFT JOIN production_tracking_card card ON card.id=output.tracking_card_id`;
  return `SELECT ${columns}
  FROM outbound_detail d JOIN outbound_order document ON document.id=d.outbound_id
  LEFT JOIN item_batch b ON b.id=d.batch_id
  LEFT JOIN materials material ON material.id=d.item_id
  LEFT JOIN material_variants variant ON variant.id=d.material_variant_id
  LEFT JOIN products product ON product.id=d.product_id
  LEFT JOIN work_orders work_order ON work_order.id=document.work_order_id
  LEFT JOIN production_batches production_batch ON production_batch.id=document.production_batch_id`;
};

const itemCodeSql = (direction: StockDocumentDirection): string =>
  `COALESCE(${direction === 'inbound' ? 'd.item_code_snapshot,' : ''}b.item_code_snapshot,material.material_code,product.item_code)`;
const itemNameSql = `CASE WHEN d.product_id IS NULL THEN material.material_name
  ELSE COALESCE(work_order.product_name_snapshot,product.product_name) END`;
const variantCodeSql = 'COALESCE(b.material_variant_code_snapshot,variant.variant_code)';

const keywordClause = (direction: StockDocumentDirection): string => {
  const m = metadata[direction];
  const sourceConditions =
    direction === 'inbound'
      ? 'OR receipt.receipt_no LIKE ? OR source_order.purchase_no LIKE ? OR d.supplier_name_snapshot LIKE ? OR card.card_no LIKE ?'
      : '';
  return `(o.${m.number} LIKE ? OR o.reason LIKE ? OR o.remark LIKE ? OR EXISTS (
    ${detailSelectSql(direction, '1')}
    WHERE d.${m.parent}=o.id AND d.is_deleted=0 AND (
      ${itemCodeSql(direction)} LIKE ? OR ${itemNameSql} LIKE ? OR ${variantCodeSql} LIKE ?
      OR b.batch_code LIKE ? OR work_order.work_order_no LIKE ? OR production_batch.batch_no LIKE ?
      ${sourceConditions})))`;
};

@Injectable()
export class MysqlStockDocumentQuery extends StockDocumentQueryPort {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async list(
    query: StockDocumentQuery,
    allowedSources: readonly StockDocumentSourceType[],
  ): Promise<PageResult<StockDocumentOrder>> {
    const page = query.page!;
    const pageSize = query.pageSize!;
    const sources = allowedSources.filter(
      (source) => !query.sourceType || source === query.sourceType,
    );
    if (!sources.length) return { items: [], total: 0, page, pageSize };
    return withActiveConnection(this.pool, async (db) => {
      const m = metadata[query.direction];
      const where = [`o.item_kind=?`, `o.source_type IN (${placeholders(sources)})`];
      const args: Array<string | number> = [query.itemKind, ...sources];
      if (query.status) {
        where.push('o.status=?');
        args.push(query.status);
      }
      if (query.keyword) {
        where.push(keywordClause(query.direction));
        args.push(
          ...Array<string>(query.direction === 'inbound' ? 13 : 9).fill(`%${query.keyword}%`),
        );
      }
      const filter = where.join(' AND ');
      const [[count]] = await db.query<(RowDataPacket & { total: string | number })[]>(
        `SELECT COUNT(*) total FROM ${m.order} o WHERE ${filter}`,
        args,
      );
      const [rows] = await db.query<ParentRow[]>(
        `SELECT ${parentColumns(query.direction)} FROM ${m.order} o WHERE ${filter}
          ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?`,
        [...args, pageSize, (page - 1) * pageSize],
      );
      const details = await this.loadDetails(
        db,
        query.direction,
        rows.map((row) => String(row.id)),
        false,
      );
      return {
        items: rows.map((row) => mapOrder(query.direction, row, details.get(String(row.id)) ?? [])),
        total: Number(count?.total ?? 0),
        page,
        pageSize,
      };
    });
  }

  get(
    direction: StockDocumentDirection,
    id: string,
    allowedSources: readonly StockDocumentSourceType[],
  ): Promise<StockDocumentOrder> {
    return withActiveConnection(this.pool, async (db) => {
      const m = metadata[direction];
      const [[row]] = await db.query<ParentRow[]>(
        `SELECT ${parentColumns(direction)} FROM ${m.order} o WHERE o.id=?`,
        [id],
      );
      if (!row) throw new InventoryDomainError('NOT_FOUND', '出入库单不存在');
      // Check the real parent scenario before fetching any line or source history.
      if (!allowedSources.includes(row.source_type))
        throw new InventoryDomainError('FORBIDDEN', '没有查看此业务场景单据的权限');
      const details = await this.loadDetails(db, direction, [id], true);
      return mapOrder(direction, row, details.get(id) ?? []);
    });
  }

  private async loadDetails(
    db: Db,
    direction: StockDocumentDirection,
    ids: string[],
    includeDeleted: boolean,
  ): Promise<Map<string, StockDocumentLine[]>> {
    const grouped = new Map<string, StockDocumentLine[]>();
    if (!ids.length) return grouped;
    const m = metadata[direction];
    const inbound = direction === 'inbound';
    const procurementColumns = inbound
      ? `receipt.id receipt_id,receipt.receipt_no,
      receipt_line.id receipt_line_id,receipt_line.line_no receipt_line_no,
      source_order.id purchase_order_id,source_order.purchase_no,
      source_line.id purchase_order_line_id,source_line.line_no purchase_order_line_no,
      source_order.supplier_id,d.supplier_name_snapshot supplier_name`
      : `
      NULL receipt_id,NULL receipt_no,NULL receipt_line_id,NULL receipt_line_no,
      NULL purchase_order_id,NULL purchase_no,NULL purchase_order_line_id,NULL purchase_order_line_no,
      NULL supplier_id,NULL supplier_name`;
    const productionColumns = inbound
      ? `d.production_output_id,output.tracking_card_id,card.card_no,
      d.return_allocation_id allocation_id,d.demand_id`
      : `
      NULL production_output_id,NULL tracking_card_id,NULL card_no,d.allocation_id,d.demand_id`;
    const transactionTypeSql = inbound
      ? `CASE document.source_type
      WHEN 'purchased' THEN 'purchase_inbound' WHEN 'finished_product' THEN 'production_inbound'
      WHEN 'return_inbound' THEN 'material_return_inbound' WHEN 'other' THEN 'other_inbound' END`
      : `CASE document.source_type WHEN 'production_material' THEN 'production_material_outbound' WHEN 'other' THEN 'other_outbound' END`;
    const columns = `d.id,d.${m.parent} parent_id,d.line_no,d.item_id,d.material_variant_id,d.product_id,
        ${itemCodeSql(direction)} item_code,${itemNameSql} item_name,${variantCodeSql} variant_code,
        d.unit_snapshot,d.${m.quantity} quantity,
        ${inbound ? 'd.target_mode,d.new_batch_key' : "'existing' target_mode,NULL new_batch_key"},
        d.batch_id,b.batch_code,d.stock_status,d.remark,d.is_deleted,tx.id transaction_id,
        work_order.id work_order_id,work_order.work_order_no,
        production_batch.id production_batch_id,production_batch.batch_no,
        ${procurementColumns},${productionColumns}`;
    const [rows] = await db.query<DetailRow[]>(
      `${detailSelectSql(direction, columns)}
      LEFT JOIN inventory_transaction tx ON tx.reference_type='${m.reference}' AND tx.reference_detail_id=d.id
        AND tx.reference_order_id=document.id AND tx.reversal_of_transaction_id IS NULL
        AND tx.transaction_type=${transactionTypeSql}
      WHERE d.${m.parent} IN (${placeholders(ids)}) ${includeDeleted ? '' : 'AND d.is_deleted=0'}
      ORDER BY d.${m.parent},d.line_no,d.id`,
      ids,
    );
    for (const row of rows) {
      const key = String(row.parent_id);
      const lines = grouped.get(key) ?? [];
      lines.push(mapLine(row));
      grouped.set(key, lines);
    }
    return grouped;
  }
}

function mapLine(row: DetailRow): StockDocumentLine {
  const procurementSource =
    row.receipt_id !== null &&
    row.receipt_no !== null &&
    row.receipt_line_id !== null &&
    row.receipt_line_no !== null &&
    row.purchase_order_id !== null &&
    row.purchase_no !== null &&
    row.purchase_order_line_id !== null &&
    row.purchase_order_line_no !== null
      ? {
          receipt: {
            receiptId: String(row.receipt_id),
            receiptNo: row.receipt_no,
            receiptLineId: String(row.receipt_line_id),
            receiptLineNo: row.receipt_line_no,
          },
          purchaseOrder: {
            purchaseOrderId: String(row.purchase_order_id),
            purchaseOrderNo: row.purchase_no,
            purchaseOrderLineId: String(row.purchase_order_line_id),
            purchaseOrderLineNo: row.purchase_order_line_no,
          },
          supplierId: nullableId(row.supplier_id),
          supplierName: row.supplier_name,
        }
      : null;
  const productionSource =
    row.work_order_id !== null &&
    row.work_order_no !== null &&
    row.production_batch_id !== null &&
    row.batch_no !== null
      ? {
          workOrderId: String(row.work_order_id),
          workOrderNo: row.work_order_no,
          productionBatchId: String(row.production_batch_id),
          batchNo: row.batch_no,
          productionOutputId: nullableId(row.production_output_id),
          trackingCardId: nullableId(row.tracking_card_id),
          trackingCardNo: row.card_no,
          allocationId: nullableId(row.allocation_id),
          demandId: nullableId(row.demand_id),
        }
      : null;
  return {
    id: String(row.id),
    lineNo: row.line_no,
    itemKind: row.product_id === null ? 'material' : 'finished_product',
    itemId: nullableId(row.item_id),
    materialVariantId: nullableId(row.material_variant_id),
    productId: nullableId(row.product_id),
    itemCode: row.item_code,
    itemName: row.item_name,
    materialVariantCode: row.variant_code,
    unit: row.unit_snapshot,
    quantity: fixedIntegerQuantity(row.quantity),
    targetMode: row.target_mode,
    newBatchKey: row.new_batch_key,
    batchId: nullableId(row.batch_id),
    batchCode: row.batch_code,
    stockStatus: row.stock_status,
    remark: row.remark,
    isDeleted: Boolean(row.is_deleted),
    inventoryTransactionId: nullableId(row.transaction_id),
    procurementSource,
    productionSource,
  };
}

function mapOrder(
  direction: StockDocumentDirection,
  row: ParentRow,
  details: StockDocumentLine[],
): StockDocumentOrder {
  const active = details.filter((line) => !line.isDeleted);
  const quantities = new Map<string, bigint>();
  for (const line of active)
    quantities.set(line.unit, (quantities.get(line.unit) ?? 0n) + BigInt(line.quantity));
  return {
    id: String(row.id),
    orderNo: row.order_no,
    direction,
    itemKind: row.item_kind,
    sourceType: row.source_type,
    status: row.status,
    version: row.version,
    reason: row.reason,
    remark: row.remark,
    detailCount: active.length,
    quantitySummary: [...quantities].map(([unit, quantity]) => ({
      unit,
      quantity: String(quantity),
    })),
    details,
    sources: summarizeSources(active),
    createdById: String(row.created_by),
    createdByName: null,
    createdAt: iso(row.created_at)!,
    operatorId: nullableId(row.operator_id),
    operatorName: null,
    confirmedAt: iso(row.confirmed_at),
    cancelSource: row.cancel_source,
    cancelReason: row.cancel_reason,
    cancelledById: nullableId(row.cancelled_by),
    cancelledByName: null,
    cancelledAt: iso(row.cancelled_at),
  };
}

function summarizeSources(lines: StockDocumentLine[]): StockDocumentSources {
  const result: StockDocumentSources = {
    procurementReceipts: [],
    purchaseOrders: [],
    productionBatches: [],
    workOrders: [],
    suppliers: [],
  };
  for (const line of lines) {
    const procurement = line.procurementSource;
    if (procurement) {
      result.procurementReceipts.push({
        id: procurement.receipt.receiptId,
        orderNo: procurement.receipt.receiptNo,
      });
      result.purchaseOrders.push({
        id: procurement.purchaseOrder.purchaseOrderId,
        orderNo: procurement.purchaseOrder.purchaseOrderNo,
      });
      if (procurement.supplierName)
        result.suppliers.push({ id: procurement.supplierId, name: procurement.supplierName });
    }
    const production = line.productionSource;
    if (production) {
      result.productionBatches.push({
        id: production.productionBatchId,
        orderNo: production.batchNo,
      });
      result.workOrders.push({ id: production.workOrderId, orderNo: production.workOrderNo });
    }
  }
  for (const key of [
    'procurementReceipts',
    'purchaseOrders',
    'productionBatches',
    'workOrders',
  ] as const)
    result[key] = [...new Map(result[key].map((reference) => [reference.id, reference])).values()];
  result.suppliers = [
    ...new Map(
      result.suppliers.map((supplier) => [JSON.stringify([supplier.id, supplier.name]), supplier]),
    ).values(),
  ];
  return result;
}

const nullableId = (value: DbId | null): string | null => (value === null ? null : String(value));
