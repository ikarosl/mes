import {
  InventoryInboundCommand,
  type FinishedInboundWrite,
  type FinishedInboundStorage,
} from '../../inventory/public.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import {
  finishedOrderSelect,
  finishedOrderCount,
  finishedCandidateSelect,
  findFinishedOrder,
} from './queries/finished-inbound-display.sql.js';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseError, withTransaction } from '@company/database';
import { FINISHED_GOODS_INBOUND_SOURCES } from '@company/constants';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
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
  FINISHED_SOURCE_FROM,
  FINISHED_SOURCE_SELECT,
  type FinishedInboundSourceRow,
  type FinishedInboundOrderRow,
  approvedFinishedQuantity,
  finishedInboundBlockers,
  mapFinishedOrder,
  mapFinishedCandidate,
} from './mysql-production-finished-inbound.read.js';

@Injectable()
export class MysqlProductionFinishedInboundRepository extends ProductionFinishedInboundRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryInboundCommand,
    private readonly products: ProductInventoryEligibility,
  ) {
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
      `${finishedOrderCount()} WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<FinishedInboundOrderRow[]>(
      `${finishedOrderSelect()} WHERE ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
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
      `${finishedCandidateSelect()} WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
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
        const { inboundId: id } = await this.inventory.createFinishedDraft(
          writeInput(
            source,
            payload.sourceType,
            payload.outputRevisionId,
            payload.batchCode,
            payload.remark ?? null,
          ),
          context,
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
      await this.inventory.updateFinishedDraft(
        id,
        payload.version,
        writeInput(
          source,
          order.source_type,
          payload.outputRevisionId,
          payload.batchCode,
          payload.remark ?? null,
        ),
        context,
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
        const confirmed = await this.inventory.confirmFinishedReceipt(
          id,
          payload.version,
          writeInput(
            source,
            order.source_type,
            payload.outputRevisionId,
            order.requested_batch_code,
            order.remark,
          ),
          context,
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
            itemBatchId: confirmed.itemBatchId,
            inventoryTransactionId: confirmed.inventoryTransactionId,
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
      await this.inventory.cancelFinishedDraft(id, payload.version, payload.reason, context);
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
    const identity = await this.products.lockHistoricalReferences({
      references: [],
      productIds: [String(row.product_id)],
    });
    if (identity.status !== 'success')
      throw new ProductionDomainError(
        identity.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
        identity.message,
      );
    return row;
  }
  private async lockOrder(db: PoolConnection, id: string) {
    const locator = await this.inventory.getFinishedLocator(id);
    const source = await this.lockSource(db, locator.productionBatchId);
    const stored = await this.inventory.getFinishedOrder(id, true);
    if (stored.productionBatchId !== locator.productionBatchId)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '入库单来源已变化');
    const order = storageRow(source, stored);
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
    const orders = await this.inventory.listFinishedSlots(String(row.production_batch_id), source);
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

function writeInput(
  row: FinishedInboundSourceRow,
  sourceType: FinishedGoodsInboundSource,
  outputRevisionId: string,
  batchCode: string,
  remark: string | null,
): FinishedInboundWrite {
  return {
    productionBatchId: String(row.production_batch_id),
    workOrderId: String(row.work_order_id),
    productId: String(row.product_id),
    outputRevisionId,
    sourceType,
    itemCode: row.product_code,
    unit: row.unit,
    quantity: approvedFinishedQuantity(row, sourceType),
    batchCode,
    remark,
  };
}
function storageRow(
  source: FinishedInboundSourceRow,
  row: FinishedInboundStorage,
): FinishedInboundOrderRow {
  return {
    ...source,
    inbound_id: row.inboundId,
    inbound_no: row.inboundNo,
    source_type: row.sourceType,
    status: row.status,
    version: row.version,
    output_revision_id: row.outputRevisionId,
    revision_no: source.current_revision_no,
    detail_id: row.detailId,
    inbound_number: row.quantity,
    requested_batch_code: row.batchCode,
    batch_id: row.batchId,
    inventory_transaction_id: row.transactionId,
    created_by: row.createdBy,
    created_at: row.createdAt,
    operator_id: row.operatorId,
    inbound_at: row.inboundAt,
    remark: row.remark,
    cancel_reason: row.cancelReason,
    cancelled_by: row.cancelledBy,
    cancelled_at: row.cancelledAt,
  };
}
