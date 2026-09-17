import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseError, withTransaction } from '@company/database';
import { FINISHED_GOODS_INBOUND_SOURCES } from '@company/constants';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  FinishedGoodsInboundSource,
  CreateFinishedGoodsInboundPayload,
  UpdateFinishedGoodsInboundPayload,
  ConfirmFinishedGoodsInboundPayload,
  CancelFinishedGoodsInboundPayload,
  FinishedGoodsInboundOrderDetail,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionFinishedInboundRepository } from '../application/ports/production-finished-inbound.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { lockOutputBatch } from './mysql-production-output.persistence.js';
import { readOutputRevisions } from './mysql-production-output.read.js';
import { writeInventoryAudit } from './mysql-production-inventory.shared.js';
import {
  FINISHED_ORDER_FROM,
  FINISHED_ORDER_SELECT,
  FINISHED_SOURCE_COLUMNS,
  FINISHED_SOURCE_FROM,
  FINISHED_SOURCE_SELECT,
  type FinishedInboundSourceRow,
  type FinishedInboundOrderRow,
  approvedFinishedQuantity,
  finishedInboundBlockers,
  findFinishedOrder,
  mapFinishedOrder,
  mapFinishedCandidate,
} from './mysql-production-finished-inbound.read.js';

@Injectable()
export class MysqlProductionFinishedInboundRepository extends ProductionFinishedInboundRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }
  async list(query: FinishedGoodsInboundQuery) {
    const conditions = ["o.source_type IN ('self_made','production_extra')"];
    const values: (string | number)[] = [];
    if (query.sourceType) {
      conditions.push('o.source_type=?');
      values.push(query.sourceType);
    }
    if (query.status) {
      conditions.push('o.status=?');
      values.push(query.status);
    }
    if (query.keyword?.trim()) {
      conditions.push(
        '(o.inbound_no LIKE ? OR b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ? OR d.requested_batch_code LIKE ?)',
      );
      values.push(...Array<string>(6).fill(`%${query.keyword.trim()}%`));
    }
    const where = conditions.join(' AND '),
      page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total ${FINISHED_ORDER_FROM} WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<FinishedInboundOrderRow[]>(
      `${FINISHED_ORDER_SELECT} WHERE ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(mapFinishedOrder), total: Number(count?.total ?? 0), page, pageSize };
  }
  async candidates(query: FinishedGoodsInboundCandidateQuery) {
    assertSource(query.sourceType);
    const conditions = ["b.status IN ('completed','terminated')"];
    const values: (string | number)[] = [];
    if (query.keyword?.trim()) {
      conditions.push(
        '(b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
      );
      values.push(...Array<string>(4).fill(`%${query.keyword.trim()}%`));
    }
    const where = conditions.join(' AND '),
      page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total ${FINISHED_SOURCE_FROM} WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<FinishedInboundSourceRow[]>(
      `SELECT ${FINISHED_SOURCE_COLUMNS},
      (SELECT o.id FROM inbound_order o WHERE o.production_batch_id=b.id AND o.source_type=? AND o.status='pending') pending_inbound_id,
      (SELECT o.id FROM inbound_order o WHERE o.production_batch_id=b.id AND o.source_type=? AND o.status='completed') completed_inbound_id
      ${FINISHED_SOURCE_FROM} WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
      [query.sourceType, query.sourceType, ...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map((row) => mapFinishedCandidate(row, query.sourceType)),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }
  get(id: string): Promise<FinishedGoodsInboundOrderDetail> {
    return withTransaction(this.pool, async (db) => {
      const row = await findFinishedOrder(db, id);
      const revisions = await readOutputRevisions(db, row.closeout_id, false);
      const approvedOutput = revisions.find(
        (revision) => revision.id === String(row.output_revision_id),
      );
      const currentApprovedOutput = revisions.find(
        (revision) => revision.id === String(row.current_revision_id),
      );
      if (!approvedOutput || !currentApprovedOutput)
        throw new ProductionDomainError('CONFLICT', '入库单批准依据不完整');
      return { ...mapFinishedOrder(row), approvedOutput, currentApprovedOutput };
    });
  }
  async create(payload: CreateFinishedGoodsInboundPayload, context: CommandContext) {
    assertActor(context);
    assertSource(payload.sourceType);
    assertBatchCode(payload.batchCode);
    try {
      return await withTransaction(this.pool, async (db) => {
        const source = await this.lockSource(db, payload.productionBatchId);
        await this.requireEligible(db, source, payload.sourceType, payload.outputRevisionId);
        const inboundNo = `FI-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const [order] = await db.execute<ResultSetHeader>(
          `INSERT INTO inbound_order
          (inbound_no,source_type,work_order_id,production_batch_id,product_id,output_revision_id,status,remark,created_by,updated_by)
          VALUES (?,?,?,?,?,?,'pending',?,?,?)`,
          [
            inboundNo,
            payload.sourceType,
            source.work_order_id,
            source.production_batch_id,
            source.product_id,
            payload.outputRevisionId,
            payload.remark ?? null,
            context.actorId,
            context.actorId,
          ],
        );
        const id = String(order.insertId);
        await db.execute(
          `INSERT INTO inbound_detail
          (inbound_id,product_id,requested_batch_code,item_code_snapshot,inbound_number,unit_snapshot,stock_status,created_by)
          VALUES (?,?,?,?,?,?,'available',?)`,
          [
            id,
            source.product_id,
            payload.batchCode,
            source.product_code,
            approvedFinishedQuantity(source, payload.sourceType),
            source.unit,
            context.actorId,
          ],
        );
        await this.audit(db, context, 'create', id, null, {
          ...payload,
          quantity: approvedFinishedQuantity(source, payload.sourceType),
        });
        return { inboundId: id };
      });
    } catch (error) {
      return duplicateError(error);
    }
  }
  update(id: string, payload: UpdateFinishedGoodsInboundPayload, context: CommandContext) {
    assertActor(context);
    assertBatchCode(payload.batchCode);
    return withTransaction(this.pool, async (db) => {
      const { source, order } = await this.lockOrder(db, id);
      requirePending(order, payload.version);
      await this.requireEligible(db, source, order.source_type, payload.outputRevisionId, id);
      await db.execute(
        'UPDATE inbound_detail SET requested_batch_code=?,inbound_number=? WHERE id=? AND batch_id IS NULL',
        [payload.batchCode, approvedFinishedQuantity(source, order.source_type), order.detail_id],
      );
      await db.execute(
        'UPDATE inbound_order SET output_revision_id=?,remark=?,version=version+1,updated_by=? WHERE id=?',
        [payload.outputRevisionId, payload.remark ?? null, context.actorId, id],
      );
      await this.audit(
        db,
        context,
        'update',
        id,
        {
          outputRevisionId: String(order.output_revision_id),
          batchCode: order.requested_batch_code,
          quantity: String(order.inbound_number),
        },
        { ...payload, quantity: approvedFinishedQuantity(source, order.source_type) },
      );
      return { inboundId: id };
    });
  }
  async confirm(id: string, payload: ConfirmFinishedGoodsInboundPayload, context: CommandContext) {
    assertActor(context);
    try {
      return await withTransaction(this.pool, async (db) => {
        const { source, order } = await this.lockOrder(db, id);
        requirePending(order, payload.version);
        await this.requireEligible(db, source, order.source_type, payload.outputRevisionId, id);
        const quantity = approvedFinishedQuantity(source, order.source_type);
        if (
          String(order.output_revision_id) !== payload.outputRevisionId ||
          Number(order.inbound_number) !== Number(quantity)
        )
          throw new ProductionDomainError(
            'CONCURRENT_MODIFICATION',
            '入库草稿未采用最新批准清单，请先核对数量并保存',
          );
        const [batch] = await db.execute<ResultSetHeader>(
          `INSERT INTO item_batch
          (product_id,item_code_snapshot,unit_snapshot,batch_code,source_type,source_work_order_id,source_production_batch_id,batch_status,remark,created_by,updated_by)
          VALUES (?,?,?,?,?,?,?,'available',?,?,?)`,
          [
            source.product_id,
            source.product_code,
            source.unit,
            order.requested_batch_code,
            order.source_type,
            source.work_order_id,
            source.production_batch_id,
            order.remark,
            context.actorId,
            context.actorId,
          ],
        );
        await db.execute('UPDATE inbound_detail SET batch_id=? WHERE id=? AND batch_id IS NULL', [
          batch.insertId,
          order.detail_id,
        ]);
        const [transaction] = await db.execute<ResultSetHeader>(
          `INSERT INTO inventory_transaction
          (product_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,idempotency_key,remark,created_by)
          VALUES (?,?,'production_inbound',?,?,'available','inbound_detail',?,?,?,?)`,
          [
            source.product_id,
            batch.insertId,
            quantity,
            source.unit,
            order.detail_id,
            `FGI:${id}:${order.detail_id}`,
            order.remark,
            context.actorId,
          ],
        );
        await db.execute(
          "UPDATE inbound_order SET status='completed',inbound_at=NOW(),operator_id=?,updated_by=?,version=version+1 WHERE id=?",
          [context.actorId, context.actorId, id],
        );
        await this.audit(
          db,
          context,
          'confirm',
          id,
          { status: 'pending', version: order.version },
          {
            status: 'completed',
            outputRevisionId: payload.outputRevisionId,
            quantity,
            itemBatchId: String(batch.insertId),
            inventoryTransactionId: String(transaction.insertId),
          },
        );
        return { inboundId: id };
      });
    } catch (error) {
      return duplicateError(error);
    }
  }
  cancel(id: string, payload: CancelFinishedGoodsInboundPayload, context: CommandContext) {
    assertActor(context);
    if (!payload.reason.trim()) throw new ProductionDomainError('INVALID_INPUT', '请填写取消原因');
    return withTransaction(this.pool, async (db) => {
      const { order } = await this.lockOrder(db, id);
      requirePending(order, payload.version);
      await db.execute(
        "UPDATE inbound_order SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=? WHERE id=?",
        [payload.reason, context.actorId, context.actorId, id],
      );
      await this.audit(
        db,
        context,
        'cancel',
        id,
        { status: 'pending' },
        { status: 'cancelled', reason: payload.reason },
      );
      return { inboundId: id };
    });
  }
  private async lockSource(db: PoolConnection, batchId: string): Promise<FinishedInboundSourceRow> {
    await lockOutputBatch(db, batchId);
    const [[row]] = await db.query<FinishedInboundSourceRow[]>(
      `${FINISHED_SOURCE_SELECT} WHERE b.id=? FOR SHARE`,
      [batchId],
    );
    if (!row) throw new ProductionDomainError('INVALID_STATE', '任务尚无批准产出清单');
    return row;
  }
  private async lockOrder(db: PoolConnection, id: string) {
    const [[locator]] = await db.query<(RowDataPacket & { production_batch_id: number })[]>(
      "SELECT production_batch_id FROM inbound_order WHERE id=? AND source_type IN ('self_made','production_extra')",
      [id],
    );
    if (!locator) throw new ProductionDomainError('NOT_FOUND', '成品入库单不存在');
    const source = await this.lockSource(db, String(locator.production_batch_id));
    const order = await findFinishedOrder(db, id, true);
    return { source, order };
  }
  private async requireEligible(
    db: PoolConnection,
    row: FinishedInboundSourceRow,
    source: FinishedGoodsInboundSource,
    revisionId: string,
    ownId?: string,
  ) {
    const blockers = finishedInboundBlockers(row, source);
    if (String(row.current_revision_id) !== revisionId)
      blockers.push('批准清单已变化，请核对最新清单');
    const [orders] = await db.query<(RowDataPacket & { id: number; status: string })[]>(
      "SELECT id,status FROM inbound_order WHERE production_batch_id=? AND source_type=? AND status IN ('pending','completed') ORDER BY id FOR UPDATE",
      [row.production_batch_id, source],
    );
    if (orders.some((order) => String(order.id) !== ownId))
      blockers.push('该类已有有效入库单；同一任务每类产出只允许收齐后确认一次');
    if (blockers.length) throw new ProductionDomainError('INVALID_STATE', blockers.join('；'));
  }
  private audit(
    db: PoolConnection,
    context: CommandContext,
    action: string,
    id: string,
    before: object | null,
    after: object,
  ) {
    return writeInventoryAudit(
      db,
      context,
      `production-finished-inbound.${action}`,
      'inbound_order',
      id,
      before,
      after,
    );
  }
}
function assertActor(context: CommandContext): void {
  if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人');
}
function assertSource(source: FinishedGoodsInboundSource): void {
  if (!FINISHED_GOODS_INBOUND_SOURCES.includes(source))
    throw new ProductionDomainError('INVALID_INPUT', '不支持的成品入库类型');
}
function assertBatchCode(code: string): void {
  if (!code.trim() || code.length > 100)
    throw new ProductionDomainError('INVALID_INPUT', '请填写有效库存批号');
}
function requirePending(row: FinishedInboundOrderRow, version: number): void {
  if (row.status !== 'pending' || row.batch_id !== null)
    throw new ProductionDomainError('INVALID_STATE', '只有尚未入库的待确认成品单可以操作');
  if (row.version !== version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '入库单已变化，请刷新核对');
}
function duplicateError(error: unknown): never {
  const cause = error instanceof DatabaseError ? error.cause : error;
  if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ER_DUP_ENTRY')
    throw new ProductionDomainError(
      'CONFLICT',
      '该类别已有有效入库单，或该成品库存批号已使用，请刷新核对',
    );
  throw error;
}
