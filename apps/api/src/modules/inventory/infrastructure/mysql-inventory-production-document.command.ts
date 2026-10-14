import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection, withTransaction } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import {
  InventoryProductionDocumentCommand,
  type InventoryProductionDocument,
  type InventoryProductionDocumentInput,
  type InventoryProductionDocumentFacts,
  type InventoryProductionDocumentFactsFilter,
} from '../application/inventory-production-document.command.js';
import { InventoryStockCommand } from '../application/inventory-stock.command.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { requireAffected, requireVersion } from './mysql-inventory.shared.js';

type Header = RowDataPacket & {
  id: string;
  no: string;
  production_batch_id: string;
  work_order_id: string;
  status: string;
  version: number;
};
type Detail = RowDataPacket & {
  id: string;
  allocation_id: string;
  demand_id: string;
  item_id: string;
  material_variant_id: string;
  batch_id: string;
  quantity: string;
  unit_snapshot: string;
  remark: string | null;
};
const meta = (returning: boolean) =>
  returning
    ? {
        table: 'inbound_order',
        detail: 'inbound_detail',
        parent: 'inbound_id',
        no: 'inbound_no',
        amount: 'inbound_number',
        allocation: 'return_allocation_id',
        source: 'return_inbound',
        time: 'inbound_at',
      }
    : {
        table: 'outbound_order',
        detail: 'outbound_detail',
        parent: 'outbound_id',
        no: 'outbound_no',
        amount: 'outbound_number',
        allocation: 'allocation_id',
        source: 'production_material',
        time: 'outbound_at',
      };

@Injectable()
export class MysqlInventoryProductionDocumentCommand extends InventoryProductionDocumentCommand {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly stock: InventoryStockCommand,
  ) {
    super();
  }

  getOutbound(id: string, lock = false) {
    return this.get(id, false, lock);
  }
  getReturn(id: string, lock = false) {
    return this.get(id, true, lock);
  }
  createOutbound(input: InventoryProductionDocumentInput, context: CommandContext) {
    return this.create(input, context, false);
  }
  createReturn(input: InventoryProductionDocumentInput, context: CommandContext) {
    return this.create(input, context, true);
  }
  completeOutbound(id: string, version: number, context: CommandContext) {
    return this.complete(id, version, context, false);
  }
  completeReturn(id: string, version: number, context: CommandContext) {
    return this.complete(id, version, context, true);
  }
  cancelOutbound(
    id: string,
    version: number,
    reason: string,
    source: 'manual' | 'production_batch' | 'production_termination',
    context: CommandContext,
  ) {
    return this.cancel(id, version, reason, context, false, source);
  }
  cancelReturn(id: string, version: number, reason: string, context: CommandContext) {
    return this.cancel(id, version, reason, context, true, 'manual');
  }

  private async get(
    id: string,
    returning: boolean,
    lock: boolean,
  ): Promise<InventoryProductionDocument> {
    return withActiveConnection(this.pool, async (db) => {
      if (lock && db === this.pool) throw new Error('库存单据当前读必须加入调用方事务');
      const m = meta(returning);
      const [[row]] = await db.query<Header[]>(
        `SELECT id,${m.no} no,production_batch_id,work_order_id,status,version FROM ${m.table} WHERE id=? AND source_type=?${lock ? ' FOR UPDATE NOWAIT' : ''}`,
        [id, m.source],
      );
      if (!row) throw new InventoryDomainError('NOT_FOUND', '生产库存单据不存在');
      return this.readDocument(db as PoolConnection, row, returning, lock);
    });
  }

  private async readDocument(
    db: PoolConnection,
    row: Header,
    returning: boolean,
    lock: boolean,
  ): Promise<InventoryProductionDocument> {
    const m = meta(returning);
    const [lines] = await db.query<Detail[]>(
      `SELECT id,${m.allocation} allocation_id,demand_id,item_id,material_variant_id,batch_id,${m.amount} quantity,unit_snapshot,remark FROM ${m.detail} WHERE ${m.parent}=? AND is_deleted=0 ORDER BY id${lock ? ' FOR SHARE NOWAIT' : ''}`,
      [row.id],
    );
    return {
      id: String(row.id),
      no: row.no,
      productionBatchId: String(row.production_batch_id),
      workOrderId: String(row.work_order_id),
      status:
        row.status === 'pending_picking'
          ? 'pending'
          : (row.status as InventoryProductionDocument['status']),
      version: row.version,
      details: lines.map((line) => ({
        id: String(line.id),
        allocationId: String(line.allocation_id),
        demandId: String(line.demand_id),
        itemId: String(line.item_id),
        materialVariantId: String(line.material_variant_id),
        batchId: String(line.batch_id),
        quantity: String(line.quantity),
        unit: line.unit_snapshot,
        remark: line.remark,
      })),
    };
  }

  private async create(
    input: InventoryProductionDocumentInput,
    context: CommandContext,
    returning: boolean,
  ): Promise<InventoryProductionDocument> {
    if (
      !input.lines.length ||
      new Set(input.lines.map((line) => line.allocationId)).size !== input.lines.length
    )
      throw new InventoryDomainError('INVALID_INPUT', '请提交不重复的生产分配');
    return withTransaction(this.pool, async (db) => {
      const batches = await this.stock.lockMaterialBatches(input.lines.map((line) => line.batchId));
      const byId = new Map(batches.map((batch) => [batch.id, batch]));
      const m = meta(returning);
      const no = await allocateBusinessNumber(
        db,
        returning ? 'production_material_return' : 'production_material_outbound',
      );
      const [header] = await db.execute<ResultSetHeader>(
        `INSERT INTO ${m.table}(${m.no},source_type,production_batch_id,work_order_id,status,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
        [
          no,
          m.source,
          input.productionBatchId,
          input.workOrderId,
          returning ? 'pending' : 'pending_picking',
          input.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const id = String(header.insertId);
      for (const [i, line] of input.lines.entries()) {
        const batch = byId.get(line.batchId);
        if (
          !batch ||
          batch.itemId !== line.itemId ||
          batch.materialVariantId !== line.materialVariantId ||
          batch.unit !== line.unit ||
          !/^\d+$/.test(line.quantity) ||
          Number(line.quantity) < 1 ||
          Number(line.quantity) > 99999999
        )
          throw new InventoryDomainError('INVALID_INPUT', '生产库存明细身份或数量不匹配');
        if (!returning && batch.batchStatus !== 'available')
          throw new InventoryDomainError('INVALID_STATE', '该批次不允许领料');
        const fields = [
          m.parent,
          'line_no',
          'source_type',
          'production_batch_id',
          'demand_id',
          m.allocation,
          'item_id',
          'material_variant_id',
          'batch_id',
          m.amount,
          'unit_snapshot',
          'stock_status',
          'remark',
          'created_by',
          'updated_by',
        ];
        const values: Array<string | number | null> = [
          id,
          i + 1,
          m.source,
          input.productionBatchId,
          line.demandId,
          line.allocationId,
          line.itemId,
          line.materialVariantId,
          line.batchId,
          line.quantity,
          line.unit,
          'available',
          line.remark ?? null,
          context.actorId,
          context.actorId,
        ];
        if (returning) {
          fields.push('target_mode', 'item_code_snapshot');
          values.push('existing', batch.itemCode);
        }
        await db.execute(
          `INSERT INTO ${m.detail}(${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
          values,
        );
      }
      return this.get(id, returning, false);
    });
  }

  private async complete(
    id: string,
    version: number,
    context: CommandContext,
    returning: boolean,
  ): Promise<InventoryProductionDocument> {
    return withTransaction(this.pool, async (db) => {
      const doc = await this.get(id, returning, true);
      if (doc.status === 'completed') return doc;
      requireVersion(doc.version, version, '库存单据');
      if (doc.status !== 'pending')
        throw new InventoryDomainError('INVALID_STATE', '只有待确认单据可以确认');
      const movements = doc.details.map((line) => ({ ...line, detailId: line.id }));
      if (returning) await this.stock.recordProductionReturn(id, movements, context);
      else await this.stock.recordProductionOutbound(id, movements, context);
      const m = meta(returning);
      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE ${m.table} SET status='completed',${m.time}=CURRENT_TIMESTAMP,operator_id=?,version=version+1,updated_by=? WHERE id=? AND version=?`,
        [context.actorId, context.actorId, id, version],
      );
      requireAffected(result, '库存单据');
      return this.get(id, returning, false);
    });
  }

  private async cancel(
    id: string,
    version: number,
    reason: string,
    context: CommandContext,
    returning: boolean,
    source: string,
  ): Promise<InventoryProductionDocument> {
    if (!reason.trim()) throw new InventoryDomainError('INVALID_INPUT', '取消原因不能为空');
    return withTransaction(this.pool, async (db) => {
      const doc = await this.get(id, returning, true);
      if (doc.status === 'cancelled') return doc;
      requireVersion(doc.version, version, '库存单据');
      if (doc.status !== 'pending')
        throw new InventoryDomainError('INVALID_STATE', '只有待确认单据可以取消');
      const m = meta(returning);
      const [result] = await db.execute<ResultSetHeader>(
        `UPDATE ${m.table} SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP,version=version+1,updated_by=?${returning ? '' : ',cancel_source=?'} WHERE id=? AND version=?`,
        [
          reason.trim(),
          context.actorId,
          context.actorId,
          ...(returning ? [] : [source]),
          id,
          version,
        ],
      );
      requireAffected(result, '库存单据');
      return this.get(id, returning, false);
    });
  }

  async facts(
    filter: InventoryProductionDocumentFactsFilter,
  ): Promise<InventoryProductionDocumentFacts> {
    if (!filter.productionBatchId && !filter.allocationIds && !filter.demandIds)
      throw new InventoryDomainError('INVALID_INPUT', '库存事实查询必须限定业务范围');
    if (filter.allocationIds?.length === 0 || filter.demandIds?.length === 0)
      return { outbounds: [], returns: [] };
    return withActiveConnection(this.pool, async (db) => {
      if (filter.lock && db === this.pool) throw new Error('库存事实当前读必须加入调用方事务');
      const read = async (returning: boolean) => {
        const m = meta(returning);
        const where = ['o.source_type=?'];
        const values: string[] = [m.source];
        if (filter.productionBatchId) {
          where.push('o.production_batch_id=?');
          values.push(filter.productionBatchId);
        }
        for (const [ids, column] of [
          [filter.allocationIds, m.allocation],
          [filter.demandIds, 'demand_id'],
        ] as const)
          if (ids) {
            where.push(
              `EXISTS(SELECT 1 FROM ${m.detail} d WHERE d.${m.parent}=o.id AND d.${column} IN (${ids.map(() => '?').join(',')}) AND d.is_deleted=0${filter.lock ? ' FOR SHARE NOWAIT' : ''})`,
            );
            values.push(...ids);
          }
        const [headers] = await db.query<Header[]>(
          `SELECT o.id,o.${m.no} no,o.production_batch_id,o.work_order_id,o.status,o.version FROM ${m.table} o WHERE ${where.join(' AND ')} ORDER BY o.id${filter.lock ? ' FOR SHARE NOWAIT' : ''}`,
          values,
        );
        const docs: InventoryProductionDocument[] = [];
        for (const header of headers) {
          const doc = await this.readDocument(
            db as PoolConnection,
            header,
            returning,
            !!filter.lock,
          );
          doc.details = doc.details.filter(
            (line) =>
              (!filter.allocationIds || filter.allocationIds.includes(line.allocationId)) &&
              (!filter.demandIds || filter.demandIds.includes(line.demandId)),
          );
          if (doc.details.length) docs.push(doc);
        }
        return docs;
      };
      return { outbounds: await read(false), returns: await read(true) };
    });
  }
}
