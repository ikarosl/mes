import { withActiveConnection } from '@company/database';
import type {
  OtherInventoryDirection,
  OtherInventoryOrder,
  OtherInventoryOrderQuery,
  OtherStockCandidate,
  OtherStockCandidateQuery,
  PageResult,
} from '@company/contracts';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { iso, pagination } from './mysql-inventory.shared.js';
import { id, meta, quantity } from './mysql-other-inventory.shared.js';
import {
  otherCandidateReservedSql,
  otherInventoryIdentityDisplay,
  otherMaterialNameSql,
  otherProductNameSql,
} from './queries/other-inventory-display.sql.js';

type Row = RowDataPacket;

/** 仓储内部读取；写命令继续使用同事务连接读取审计前后快照。 */
export class MysqlOtherInventoryReader {
  constructor(private readonly pool: Pool) {}

  async list(
    direction: OtherInventoryDirection,
    query: OtherInventoryOrderQuery,
  ): Promise<PageResult<OtherInventoryOrder>> {
    return withActiveConnection(this.pool, async (db) => {
      const m = meta(direction);
      const p = pagination(query);
      const filters = ["source_type='other'"];
      const args: unknown[] = [];
      if (query.status) {
        filters.push('status=?');
        args.push(query.status);
      }
      if (query.keyword?.trim()) {
        filters.push(`(${m.number} LIKE ? OR reason LIKE ? OR remark LIKE ?)`);
        args.push(...Array(3).fill(`%${query.keyword.trim()}%`));
      }
      const where = filters.join(' AND ');
      const [[count]] = await db.query<Row[]>(
        `SELECT COUNT(*) total FROM ${m.order} WHERE ${where}`,
        args,
      );
      const [rows] = await db.query<Row[]>(
        `SELECT id FROM ${m.order} WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...args, p.pageSize, p.offset],
      );
      const items: OtherInventoryOrder[] = [];
      for (const row of rows) items.push(await this.read(db, direction, String(row.id)));
      return { items, total: Number(count!.total), page: p.page, pageSize: p.pageSize };
    });
  }
  get(direction: OtherInventoryDirection, orderId: string): Promise<OtherInventoryOrder> {
    return withActiveConnection(this.pool, (db) => this.read(db, direction, orderId));
  }
  async read(
    db: Pool | PoolConnection,
    direction: OtherInventoryDirection,
    orderId: string,
  ): Promise<OtherInventoryOrder> {
    const m = meta(direction);
    const [[row]] = await db.query<Row[]>(
      `SELECT * FROM ${m.order} WHERE id=? AND source_type='other'`,
      [orderId],
    );
    if (!row) throw new InventoryDomainError('NOT_FOUND', '其他出入库单不存在');
    const [lines] = await db.query<Row[]>(
      `SELECT d.*,${otherInventoryIdentityDisplay.columns}, b.batch_code,
      (SELECT tx.id FROM inventory_transaction tx WHERE tx.reference_type=? AND tx.reference_detail_id=d.id AND tx.reversal_of_transaction_id IS NULL) transaction_id
      FROM ${m.detail} d 
      LEFT JOIN item_batch b ON b.id=d.batch_id WHERE d.${m.parent}=? ORDER BY d.line_no`,
      [m.reference, orderId],
    );
    return {
      id: String(row.id),
      orderNo: row[m.number],
      direction,
      status: row.status,
      version: row.version,
      reason: row.reason,
      remark: row.remark,
      createdById: String(row.created_by),
      createdByName: null,
      createdAt: iso(row.created_at)!,
      operatorId: id(row.operator_id),
      operatorName: null,
      confirmedAt: iso(row[m.at]),
      cancelReason: row.cancel_reason,
      cancelledById: id(row.cancelled_by),
      cancelledByName: null,
      cancelledAt: iso(row.cancelled_at),
      details: lines.map((line) => ({
        id: String(line.id),
        lineNo: line.line_no,
        itemKind: line.product_id ? 'finished_product' : 'material',
        itemId: id(line.item_id),
        materialVariantId: id(line.material_variant_id),
        productId: id(line.product_id),
        itemCode: line.item_code_snapshot ?? line.display_code,
        itemName: line.display_name,
        materialVariantCode: line.display_variant_code ?? null,
        unit: line.unit_snapshot,
        quantity: quantity(line[m.quantity]),
        targetMode: direction === 'inbound' ? line.target_mode : 'existing',
        newBatchKey: direction === 'inbound' ? line.new_batch_key : null,
        batchId: id(line.batch_id),
        batchCode: line.batch_code ?? null,
        remark: line.remark,
        isDeleted: Boolean(line.is_deleted),
        inventoryTransactionId: id(line.transaction_id),
      })),
    };
  }
  async candidates(query: OtherStockCandidateQuery): Promise<PageResult<OtherStockCandidate>> {
    return withActiveConnection(this.pool, async (db) => {
      const p = pagination(query);
      const filters = ["d.batch_status='available'"];
      const args: unknown[] = [];
      if (query.itemKind)
        filters.push(
          query.itemKind === 'material' ? 'd.item_id IS NOT NULL' : 'd.product_id IS NOT NULL',
        );
      if (query.materialVariantId) {
        filters.push('d.material_variant_id=?');
        args.push(query.materialVariantId);
      }
      if (query.productId) {
        filters.push('d.product_id=?');
        args.push(query.productId);
      }
      if (query.keyword?.trim()) {
        filters.push(
          `(d.batch_code LIKE ? OR ${otherMaterialNameSql} LIKE ? OR ${otherProductNameSql} LIKE ? OR d.item_code_snapshot LIKE ?)`,
        );
        args.push(...Array(4).fill(`%${query.keyword.trim()}%`));
      }
      const base = `SELECT d.*,${otherInventoryIdentityDisplay.columns},COALESCE((SELECT SUM(tx.quantity) FROM inventory_transaction tx WHERE tx.batch_id=d.id AND tx.stock_status='available'),0) available_quantity,${otherCandidateReservedSql} reserved_quantity FROM item_batch d  WHERE ${filters.join(' AND ')}`;
      const condition =
        query.direction === 'outbound' ? 'available_quantity-reserved_quantity>0' : '1=1';
      const [[count]] = await db.query<Row[]>(
        `SELECT COUNT(*) total FROM (${base}) candidate WHERE ${condition}`,
        args,
      );
      const [rows] = await db.query<Row[]>(
        `SELECT * FROM (${base}) candidate WHERE ${condition} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...args, p.pageSize, p.offset],
      );
      return {
        items: rows.map((row) => ({
          batchId: String(row.id),
          batchCode: row.batch_code,
          itemKind: row.product_id ? 'finished_product' : 'material',
          itemId: id(row.item_id),
          materialVariantId: id(row.material_variant_id),
          productId: id(row.product_id),
          itemCode: row.item_code_snapshot,
          itemName: row.display_name,
          materialVariantCode: row.material_variant_code_snapshot,
          unit: row.unit_snapshot,
          availableQuantity: quantity(row.available_quantity),
          reservedQuantity: quantity(row.reserved_quantity),
          usableQuantity: quantity(
            Math.max(0, Number(row.available_quantity) - Number(row.reserved_quantity)),
          ),
        })),
        total: Number(count!.total),
        page: p.page,
        pageSize: p.pageSize,
      };
    });
  }
}
