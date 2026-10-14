import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type {
  OtherInventoryDirection,
  OtherInventoryDraftPayload,
  OtherInventoryLine,
  OtherInventoryLinePayload,
  OtherInventoryOrder,
  OtherInventoryOrderQuery,
  OtherStockCandidate,
  OtherStockCandidateQuery,
  OtherStockObject,
  PageResult,
  SaveOtherInventoryDraftPayload,
} from '@company/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { integerQuantity } from '@company/utils';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import { ProductOtherStockQuery } from '../../product/public.js';
import { OtherInventoryRepository } from '../application/ports/other-inventory.repository.js';
import { InventoryReservationReadPort } from '../application/ports/inventory-reservation-read.port.js';
import { InventoryDomainError } from '../domain/inventory.errors.js';
import { placeholders, requireVersion, writeInventoryAudit } from './mysql-inventory.shared.js';
import { MysqlOtherInventoryReader } from './mysql-other-inventory.reader.js';
import {
  clean,
  fail,
  id,
  meta,
  otherInventoryPayloadLine,
  sortIds,
  validateOtherInventoryDraft,
} from './mysql-other-inventory.shared.js';

type Row = RowDataPacket;

@Injectable()
export class MysqlOtherInventoryRepository extends OtherInventoryRepository {
  private readonly reader: MysqlOtherInventoryReader;
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly products: ProductOtherStockQuery,
    private readonly reservations: InventoryReservationReadPort,
  ) {
    super();
    this.reader = new MysqlOtherInventoryReader(pool);
  }

  list(
    direction: OtherInventoryDirection,
    query: OtherInventoryOrderQuery,
  ): Promise<PageResult<OtherInventoryOrder>> {
    return this.reader.list(direction, query);
  }
  get(direction: OtherInventoryDirection, orderId: string): Promise<OtherInventoryOrder> {
    return this.reader.get(direction, orderId);
  }
  candidates(query: OtherStockCandidateQuery): Promise<PageResult<OtherStockCandidate>> {
    return this.reader.candidates(query);
  }
  create(
    direction: OtherInventoryDirection,
    payload: OtherInventoryDraftPayload,
    context: CommandContext,
  ): Promise<OtherInventoryOrder> {
    return withTransaction(this.pool, async (db) => {
      validateOtherInventoryDraft(direction, payload);
      if (payload.details.some((line) => line.id)) fail('新建明细不能指定已有ID');
      const objects = await this.resolve(payload.details);
      await this.lockBatches(db, payload.details, objects);
      const m = meta(direction);
      const no = await allocateBusinessNumber(
        db,
        direction === 'inbound' ? 'other_inbound' : 'other_outbound',
      );
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO ${m.order} (${m.number},source_type,status,reason,remark,created_by,updated_by) VALUES (?,'other',?,?,?,?,?)`,
        [
          no,
          m.pending,
          payload.reason.trim(),
          clean(payload.remark),
          context.actorId,
          context.actorId,
        ],
      );
      const orderId = String(result.insertId);
      for (let i = 0; i < payload.details.length; i++)
        await this.insertLine(
          db,
          direction,
          orderId,
          i + 1,
          payload.details[i]!,
          objects[i]!,
          context,
        );
      const after = await this.reader.read(db, direction, orderId);
      await writeInventoryAudit(
        db,
        context,
        `other_${direction}.create`,
        m.order,
        orderId,
        null,
        after,
      );
      return after;
    });
  }
  save(
    direction: OtherInventoryDirection,
    orderId: string,
    payload: SaveOtherInventoryDraftPayload,
    context: CommandContext,
  ): Promise<OtherInventoryOrder> {
    return withTransaction(this.pool, async (db) => {
      validateOtherInventoryDraft(direction, payload);
      const m = meta(direction);
      await this.lockOrder(db, direction, orderId, payload.version);
      const before = await this.reader.read(db, direction, orderId);
      const objects = await this.resolve(payload.details);
      await this.lockBatches(db, payload.details, objects);
      const retained = new Set(payload.details.map((line) => line.id).filter(Boolean));
      if (retained.size !== payload.details.filter((line) => line.id).length)
        fail('明细ID不能重复');
      for (const existing of before.details.filter(
        (line) => !line.isDeleted && !retained.has(line.id),
      ))
        await db.execute(
          `UPDATE ${m.detail} SET is_deleted=1,deleted_by=?,deleted_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?`,
          [context.actorId, context.actorId, existing.id],
        );
      // 先分离现有新批次分组，再写最终分组；避免同时更改组内对象时逐行即时约束读到半更新状态。
      // 临时键只存在本事务，所有保留行随后写回请求中的规范化键，审计仅保存前后稳定状态。
      if (direction === 'inbound')
        for (const existing of before.details.filter(
          (line) => !line.isDeleted && retained.has(line.id) && line.targetMode === 'new',
        ))
          await db.execute('UPDATE inbound_detail SET new_batch_key=?,updated_by=? WHERE id=?', [
            `editing:${randomUUID()}`,
            context.actorId,
            existing.id,
          ]);
      let nextLine = Math.max(0, ...before.details.map((line) => line.lineNo)) + 1;
      for (let i = 0; i < payload.details.length; i++) {
        const line = payload.details[i]!;
        const object = objects[i]!;
        if (!line.id) {
          await this.insertLine(db, direction, orderId, nextLine++, line, object, context);
          continue;
        }
        if (!before.details.some((old) => old.id === line.id && !old.isDeleted))
          fail('明细不属于本单或已删除');
        const fields = [
          'item_id=?',
          'material_variant_id=?',
          'product_id=?',
          'batch_id=?',
          `${m.quantity}=?`,
          'unit_snapshot=?',
          'remark=?',
          'updated_by=?',
        ];
        const values: Array<string | number | null> = [
          object.itemId,
          object.materialVariantId,
          object.productId,
          line.target.mode === 'existing' ? line.target.batchId : null,
          line.quantity,
          object.unit,
          clean(line.remark),
          context.actorId,
        ];
        if (direction === 'inbound') {
          fields.push('target_mode=?', 'new_batch_key=?', 'item_code_snapshot=?');
          values.push(
            line.target.mode,
            line.target.mode === 'new' ? line.target.clientKey.trim() : null,
            object.code,
          );
        }
        await db.execute(`UPDATE ${m.detail} SET ${fields.join(',')} WHERE id=?`, [
          ...values,
          line.id,
        ]);
      }
      await db.execute(
        `UPDATE ${m.order} SET reason=?,remark=?,version=version+1,updated_by=? WHERE id=?`,
        [payload.reason.trim(), clean(payload.remark), context.actorId, orderId],
      );
      const after = await this.reader.read(db, direction, orderId);
      await writeInventoryAudit(
        db,
        context,
        `other_${direction}.save`,
        m.order,
        orderId,
        before,
        after,
      );
      return after;
    });
  }
  confirm(
    direction: OtherInventoryDirection,
    orderId: string,
    version: number,
    context: CommandContext,
  ): Promise<OtherInventoryOrder> {
    return withTransaction(this.pool, async (db) => {
      const m = meta(direction);
      if (await this.lockOrder(db, direction, orderId, version, 'completed'))
        return this.reader.read(db, direction, orderId);
      const before = await this.reader.read(db, direction, orderId);
      const active = before.details.filter((line) => !line.isDeleted).map((line) => ({ ...line }));
      const payload = {
        reason: before.reason,
        details: active.map((line) => otherInventoryPayloadLine(line)),
      };
      validateOtherInventoryDraft(direction, payload);
      const objects = await this.resolve(payload.details);
      await this.lockBatches(db, payload.details, objects);
      const newBatches = new Map<string, string>();
      for (let i = 0; i < active.length; i++) {
        const line = active[i]!;
        const object = objects[i]!;
        if (line.targetMode === 'new') {
          let batchId = newBatches.get(line.newBatchKey!);
          if (!batchId) {
            const code = await allocateBusinessNumber(db, 'inventory_batch');
            const [result] = await db.execute<ResultSetHeader>(
              `INSERT INTO item_batch (item_id,material_variant_id,product_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [
                object.itemId,
                object.materialVariantId,
                object.productId,
                object.code,
                object.materialVariantCode,
                object.unit,
                code,
                object.itemKind === 'material' ? 'other' : 'finished_product',
                context.actorId,
                context.actorId,
              ],
            );
            batchId = String(result.insertId);
            newBatches.set(line.newBatchKey!, batchId);
          }
          line.batchId = batchId;
          await db.execute('UPDATE inbound_detail SET batch_id=?,updated_by=? WHERE id=?', [
            batchId,
            context.actorId,
            line.id,
          ]);
        }
      }
      if (direction === 'outbound') await this.requireUnreserved(db, active);
      for (const line of active) {
        await db.execute(
          `INSERT INTO inventory_transaction (item_id,material_variant_id,product_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,remark,created_by) VALUES (?,?,?,?,?,?,?,'available',?,?,?,?,?)`,
          [
            line.itemId,
            line.materialVariantId,
            line.productId,
            line.batchId,
            direction === 'inbound' ? 'other_inbound' : 'other_outbound',
            (direction === 'inbound' ? 1 : -1) * integerQuantity(line.quantity),
            line.unit,
            m.reference,
            line.id,
            `${direction === 'inbound' ? 'INBOUND' : 'OUTBOUND'}:${line.id}`,
            line.remark,
            context.actorId,
          ],
        );
      }
      await db.execute(
        `UPDATE ${m.order} SET status='completed',${m.at}=CURRENT_TIMESTAMP,operator_id=?,version=version+1,updated_by=? WHERE id=?`,
        [context.actorId, context.actorId, orderId],
      );
      const after = await this.reader.read(db, direction, orderId);
      await writeInventoryAudit(
        db,
        context,
        `other_${direction}.confirm`,
        m.order,
        orderId,
        before,
        after,
      );
      return after;
    });
  }
  cancel(
    direction: OtherInventoryDirection,
    orderId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<OtherInventoryOrder> {
    return withTransaction(this.pool, async (db) => {
      if (!clean(reason)) fail('取消原因不能为空');
      const m = meta(direction);
      if (await this.lockOrder(db, direction, orderId, version, 'cancelled'))
        return this.reader.read(db, direction, orderId);
      const before = await this.reader.read(db, direction, orderId);
      await db.execute(
        `UPDATE ${m.order} SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP,version=version+1,updated_by=?${direction === 'outbound' ? ",cancel_source='manual'" : ''} WHERE id=?`,
        [reason.trim(), context.actorId, context.actorId, orderId],
      );
      const after = await this.reader.read(db, direction, orderId);
      await writeInventoryAudit(
        db,
        context,
        `other_${direction}.cancel`,
        m.order,
        orderId,
        before,
        after,
      );
      return after;
    });
  }
  private async lockOrder(
    db: PoolConnection,
    direction: OtherInventoryDirection,
    orderId: string,
    version: number,
    terminal?: 'completed' | 'cancelled',
  ): Promise<boolean> {
    const m = meta(direction);
    const [[row]] = await db.query<Row[]>(
      `SELECT status,version FROM ${m.order} WHERE id=? AND source_type='other' FOR UPDATE`,
      [orderId],
    );
    if (!row) throw new InventoryDomainError('NOT_FOUND', '其他出入库单不存在');
    if (terminal && row.status === terminal) return true;
    requireVersion(row.version, version, '其他出入库单');
    if (row.status !== m.pending)
      throw new InventoryDomainError('INVALID_STATE', '只有草稿可办理此操作');
    await db.query(`SELECT id FROM ${m.detail} WHERE ${m.parent}=? ORDER BY id FOR UPDATE`, [
      orderId,
    ]);
    return false;
  }
  private async resolve(lines: OtherInventoryLinePayload[]): Promise<OtherStockObject[]> {
    const result = await this.products.resolveReferences({
      references: lines.map((line) => ({
        itemKind: line.itemKind,
        materialVariantId: line.materialVariantId,
        productId: line.productId,
        requireEnabled: line.target.mode === 'new',
      })),
    });
    if (result.status !== 'success')
      throw new InventoryDomainError(
        result.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
        result.message,
      );
    return result.value;
  }
  private async lockBatches(
    db: PoolConnection,
    lines: OtherInventoryLinePayload[],
    objects: OtherStockObject[],
  ): Promise<void> {
    const ids = sortIds(
      lines.flatMap((line) => (line.target.mode === 'existing' ? [line.target.batchId] : [])),
    );
    if (!ids.length) return;
    const [rows] = await db.query<Row[]>(
      `SELECT * FROM item_batch WHERE id IN (${placeholders(ids)}) ORDER BY id FOR UPDATE`,
      ids,
    );
    const batches = new Map(rows.map((row) => [String(row.id), row]));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!,
        object = objects[i]!;
      if (line.target.mode !== 'existing') continue;
      const batch = batches.get(line.target.batchId);
      if (!batch || batch.batch_status !== 'available')
        throw new InventoryDomainError('INVALID_STATE', '库存批次不存在、被冻结或已停用');
      if (
        id(batch.item_id) !== object.itemId ||
        id(batch.material_variant_id) !== object.materialVariantId ||
        id(batch.product_id) !== object.productId ||
        batch.unit_snapshot !== object.unit ||
        batch.item_code_snapshot !== object.code
      )
        fail('批次与明细对象、版本或单位不一致');
    }
  }
  private async insertLine(
    db: PoolConnection,
    direction: OtherInventoryDirection,
    orderId: string,
    lineNo: number,
    line: OtherInventoryLinePayload,
    object: OtherStockObject,
    context: CommandContext,
  ): Promise<void> {
    const m = meta(direction);
    const fields = [
      m.parent,
      'line_no',
      'source_type',
      'item_id',
      'material_variant_id',
      'product_id',
      'batch_id',
      m.quantity,
      'unit_snapshot',
      'remark',
      'created_by',
      'updated_by',
    ];
    const values: Array<string | number | null> = [
      orderId,
      lineNo,
      'other',
      object.itemId,
      object.materialVariantId,
      object.productId,
      line.target.mode === 'existing' ? line.target.batchId : null,
      line.quantity,
      object.unit,
      clean(line.remark),
      context.actorId,
      context.actorId,
    ];
    if (direction === 'inbound') {
      fields.push('target_mode', 'new_batch_key', 'item_code_snapshot');
      values.push(
        line.target.mode,
        line.target.mode === 'new' ? line.target.clientKey.trim() : null,
        object.code,
      );
    }
    await db.execute(
      `INSERT INTO ${m.detail} (${fields.join(',')}) VALUES (${placeholders(values)})`,
      values,
    );
  }
  private async requireUnreserved(db: PoolConnection, lines: OtherInventoryLine[]): Promise<void> {
    const ids = sortIds(lines.map((line) => line.batchId!));
    const allocations = await this.reservations.currentAllocations(ids);
    const reserved = new Map<string, number>();
    if (allocations.length) {
      // 当前读防止 RR 快照漏掉已确认领料；NOWAIT 避免与来源先锁分配的命令逆序等待。
      const allocationIds = sortIds(allocations.map((row) => row.id));
      const [issued] = await db.query<Row[]>(
        `SELECT d.allocation_id,d.outbound_number FROM outbound_detail d JOIN outbound_order o ON o.id=d.outbound_id WHERE d.allocation_id IN (${placeholders(allocationIds)}) AND d.source_type='production_material' AND d.is_deleted=0 AND o.status='completed' ORDER BY d.id FOR SHARE NOWAIT`,
        allocationIds,
      );
      const totals = new Map<string, number>();
      for (const row of issued)
        totals.set(
          String(row.allocation_id),
          (totals.get(String(row.allocation_id)) ?? 0) + Number(row.outbound_number),
        );
      for (const row of allocations)
        reserved.set(
          row.batchId,
          (reserved.get(row.batchId) ?? 0) +
            Math.max(0, Number(row.assignedNumber) - (totals.get(row.id) ?? 0)),
        );
    }
    const needed = new Map<string, number>();
    for (const line of lines)
      needed.set(line.batchId!, (needed.get(line.batchId!) ?? 0) + integerQuantity(line.quantity));
    for (const batchId of ids) {
      const [postings] = await db.query<Row[]>(
        "SELECT quantity FROM inventory_transaction WHERE batch_id=? AND stock_status='available' ORDER BY id FOR SHARE",
        [batchId],
      );
      const available = postings.reduce((sum, row) => sum + Number(row.quantity), 0);
      if (available - (reserved.get(batchId) ?? 0) < needed.get(batchId)!)
        throw new InventoryDomainError(
          'INSUFFICIENT_AVAILABLE_STOCK',
          '未预留可用库存不足，整单未出库',
        );
    }
  }
}
