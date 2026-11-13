import type { InventoryInboundBatchCandidate, PageResult } from '@company/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  InventoryInboundQuery,
  type TrackingOutputReceipt,
} from '../application/inventory-inbound.query.js';
import type { ReceiptInboundFacts } from '../application/inventory-purchase-inbound.types.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';

type FactRow = RowDataPacket & {
  detail_id: number | string;
  receipt_line_id: number | string;
  quantity: number | string;
};

@Injectable()
export class MysqlInventoryInboundQuery extends InventoryInboundQuery {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listInboundBatchCandidates(input: {
    itemKind: 'material' | 'finished_product';
    materialVariantId?: string;
    productId?: string;
    unit: string;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PageResult<InventoryInboundBatchCandidate>> {
    const identity = input.itemKind === 'material' ? input.materialVariantId : input.productId;
    if (
      !identity ||
      !/^[1-9]\d*$/.test(identity) ||
      !input.unit.trim() ||
      input.unit.length > 20 ||
      !Number.isSafeInteger(input.page) ||
      input.page < 1 ||
      !Number.isSafeInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100
    )
      throw new InventoryDomainError('INVALID_INPUT', '批次候选身份或分页无效');
    const column = input.itemKind === 'material' ? 'material_variant_id' : 'product_id';
    const keyword = input.keyword?.trim();
    const where = `b.${column}=? AND b.unit_snapshot=? AND b.batch_status='available'${keyword ? ' AND b.batch_code LIKE ?' : ''}`;
    const params = keyword ? [identity, input.unit, `%${keyword}%`] : [identity, input.unit];
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM item_batch b WHERE ${where}`,
      params,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number | string;
        batch_code: string;
        unit_snapshot: string;
        current_quantity: string;
        version: number;
      })[]
    >(
      `SELECT b.id,b.batch_code,b.unit_snapshot,b.version,COALESCE(balance.current_quantity,0) current_quantity
      FROM item_batch b LEFT JOIN inventory_batch_balance balance ON balance.batch_id=b.id AND balance.stock_status='available'
      WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
      [...params, input.pageSize, (input.page - 1) * input.pageSize],
    );
    return {
      items: rows.map((row) => ({
        batchId: String(row.id),
        batchCode: row.batch_code,
        unit: row.unit_snapshot,
        batchStatus: 'available' as const,
        availableQuantity: String(row.current_quantity),
        version: Number(row.version),
      })),
      total: Number(count?.total ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async listTrackingInboundBatchCandidates(input: {
    productionBatchId: string;
    productId: string;
    unit: string;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PageResult<InventoryInboundBatchCandidate>> {
    if (
      [input.productionBatchId, input.productId].some((id) => !/^[1-9]\d*$/.test(id)) ||
      !input.unit.trim() ||
      input.unit.length > 20 ||
      !Number.isSafeInteger(input.page) ||
      input.page < 1 ||
      !Number.isSafeInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100
    )
      throw new InventoryDomainError('INVALID_INPUT', '生产任务、成品身份或分页无效');
    const keyword = input.keyword?.trim();
    const where = `b.product_id=? AND b.unit_snapshot=? AND b.source_type='finished_product' AND b.batch_status='available'
      AND EXISTS(SELECT 1 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
        JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
          AND t.transaction_type='production_inbound' AND t.reversal_of_transaction_id IS NULL
          AND t.product_id=d.product_id AND t.batch_id=d.batch_id AND t.quantity=d.inbound_number
          AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status
        WHERE d.batch_id=b.id AND d.is_deleted=0 AND o.source_type='finished_product' AND o.status='completed' AND o.production_batch_id=?)
      AND NOT EXISTS(SELECT 1 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
        WHERE d.batch_id=b.id AND d.is_deleted=0 AND o.source_type='finished_product' AND o.status='completed' AND o.production_batch_id<>?)
      ${keyword ? 'AND b.batch_code LIKE ?' : ''}`;
    const params: Array<string | number> = [
      input.productId,
      input.unit,
      input.productionBatchId,
      input.productionBatchId,
    ];
    if (keyword) params.push(`%${keyword}%`);
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM item_batch b WHERE ${where}`,
      params,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number | string;
        batch_code: string;
        unit_snapshot: string;
        version: number;
        current_quantity: string;
      })[]
    >(
      `SELECT b.id,b.batch_code,b.unit_snapshot,b.version,COALESCE(balance.current_quantity,0) current_quantity
       FROM item_batch b LEFT JOIN inventory_batch_balance balance ON balance.batch_id=b.id AND balance.stock_status='available'
       WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
      [...params, input.pageSize, (input.page - 1) * input.pageSize],
    );
    return {
      items: rows.map((row) => ({
        batchId: String(row.id),
        batchCode: row.batch_code,
        unit: row.unit_snapshot,
        batchStatus: 'available' as const,
        availableQuantity: String(row.current_quantity),
        version: Number(row.version),
      })),
      total: Number(count?.total ?? 0),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  getTrackingOutputReceipts(input: { outputIds: string[] }): Promise<TrackingOutputReceipt[]> {
    const ids = [...new Set(input.outputIds)];
    if (ids.length > 100 || ids.some((id) => !/^[1-9]\d*$/.test(id)))
      throw new InventoryDomainError('INVALID_INPUT', '一次最多查询 100 笔有效产出');
    if (!ids.length) return Promise.resolve([]);
    ids.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    return withActiveConnection(this.pool, async (db) => {
      const [rows] = await db.query<
        (RowDataPacket & {
          output_id: number | string;
          inbound_id: number | string;
          inbound_no: string;
          batch_id: number | string;
          quantity: number | string;
        })[]
      >(
        `SELECT d.production_output_id output_id,o.id inbound_id,o.inbound_no,d.batch_id,t.quantity
         FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
         JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
           AND t.transaction_type='production_inbound' AND t.reversal_of_transaction_id IS NULL AND t.quantity=d.inbound_number AND t.quantity>0
           AND t.product_id=d.product_id AND t.batch_id=d.batch_id AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status
         WHERE o.source_type='finished_product' AND o.status='completed' AND d.source_type='finished_product' AND d.is_deleted=0
           AND d.production_output_id IN (${ids.map(() => '?').join(',')})
         ORDER BY d.production_output_id,d.id,t.id${db === this.pool ? '' : ' FOR SHARE'}`,
        ids,
      );
      if (new Set(rows.map((row) => String(row.output_id))).size !== rows.length)
        throw new InventoryDomainError('INVALID_STATE', '产出存在重复入库事实');
      if (!rows.length) return [];
      const batchIds = [...new Set(rows.map((row) => String(row.batch_id)))];
      // A receipt may have committed after this transaction established its snapshot.
      // Current-read its batch too; source commands reject already-received outputs
      // before selecting or locking a target for a new posting.
      const [batches] = await db.query<
        (RowDataPacket & { id: number | string; batch_code: string })[]
      >(
        `SELECT id,batch_code FROM item_batch WHERE id IN (${batchIds.map(() => '?').join(',')})${db === this.pool ? '' : ' FOR SHARE'}`,
        batchIds,
      );
      const batchById = new Map(batches.map((batch) => [String(batch.id), batch.batch_code]));
      return rows.map((row) => {
        const batchCode = batchById.get(String(row.batch_id));
        if (!batchCode) throw new InventoryDomainError('INVALID_STATE', '产出入库批次事实缺失');
        return {
          outputId: String(row.output_id),
          inboundId: String(row.inbound_id),
          inboundNo: row.inbound_no,
          itemBatchId: String(row.batch_id),
          batchCode,
          inboundQuantity: String(row.quantity),
        };
      });
    });
  }

  getReceiptInboundFacts(input: { receiptLineIds: string[] }): Promise<ReceiptInboundFacts[]> {
    const ids = [...new Set(input.receiptLineIds)];
    if (ids.length > 100 || ids.some((id) => !/^[1-9]\d*$/.test(id)))
      throw new InventoryDomainError('INVALID_INPUT', '一次最多查询 100 个有效到货明细');
    if (!ids.length) return Promise.resolve([]);
    ids.sort((a, b) => {
      if (BigInt(a) < BigInt(b)) return -1;
      if (BigInt(a) > BigInt(b)) return 1;
      return 0;
    });
    return withActiveConnection(this.pool, async (db) => {
      // 保留事实当前读；批次身份由组合外键保证，不为展示批号提前取得库批共享锁。
      // 共批入库只在确认写入时统一锁定目标批次，避免历史共享锁再升级为排他锁。
      const [rows] = await db.query<FactRow[]>(
        `SELECT d.id detail_id,d.procurement_receipt_line_id receipt_line_id,
         tx.quantity
         FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id
         JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
           AND tx.transaction_type='purchase_inbound' AND tx.reversal_of_transaction_id IS NULL AND tx.quantity=d.inbound_number AND tx.quantity>0
           AND tx.batch_id=d.batch_id AND tx.item_id=d.item_id AND tx.material_variant_id=d.material_variant_id
           AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
         WHERE o.source_type='purchased' AND o.status='completed' AND d.stock_status='available' AND d.is_deleted=0
           AND d.procurement_receipt_line_id IN (${ids.map(() => '?').join(',')})
         ORDER BY d.procurement_receipt_line_id,d.id,tx.id${db === this.pool ? '' : ' FOR SHARE'}`,
        ids,
      );
      const byReceipt = new Map(
        ids.map((receiptLineId): [string, ReceiptInboundFacts] => [
          receiptLineId,
          {
            receiptLineId,
            inboundQuantity: '0',
            receipts: [],
          },
        ]),
      );
      const seenDetails = new Set<string>();
      for (const row of rows) {
        const target = byReceipt.get(String(row.receipt_line_id))!;
        const detailId = String(row.detail_id);
        if (seenDetails.has(detailId))
          throw new InventoryDomainError('INVALID_STATE', '到货入库事实存在重复正流水');
        seenDetails.add(detailId);
        target.inboundQuantity = String(BigInt(target.inboundQuantity) + BigInt(row.quantity));
        target.receipts.push({
          inboundDetailId: detailId,
          quantity: String(row.quantity),
        });
      }
      return ids.map((id) => byReceipt.get(id)!);
    });
  }
}
