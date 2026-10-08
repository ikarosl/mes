import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderDetail,
  ConfirmFinishedGoodsInboundPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { InventoryInboundCommand } from '../../inventory/public.js';
import { ProductionFinishedInboundRepository } from '../application/ports/production-finished-inbound.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { lockOutputBatch } from './mysql-production-output.persistence.js';
import { readOutputRevisionsByIds } from './mysql-production-output.read.js';
import { listFinishedOrders, getFinishedOrder } from './queries/finished-inbound-display.sql.js';
import { finishedAllocationReceivedSql } from './queries/finished-inbound-candidates.sql.js';

type AllocationRow = RowDataPacket & {
  production_batch_id: number;
  received_quantity: number | string;
  id: number;
  revision_id: number;
  round_id: number;
  category: 'self_made' | 'production_extra';
  quantity: number | string;
  revision_no: number;
  status: string;
  current_round_id: number | null;
  current_revision_id: number | null;
  pending_approval_id: number | null;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code: string;
  product_name: string;
  unit: string;
  batch_status: string;
};
const ALLOCATION_SOURCE = `FROM production_output_allocation a
 JOIN production_output_revision r ON r.id=a.revision_id
 JOIN production_output_round round ON round.id=a.round_id
 JOIN production_batch_closeout c ON c.id=a.closeout_id
 JOIN production_batches b ON b.id=c.production_batch_id
 JOIN work_orders wo ON wo.id=b.work_order_id`;
const ALLOCATION_COLUMNS = `b.id production_batch_id,a.id,a.revision_id,a.round_id,a.category,a.quantity,r.revision_no,
 round.status,c.current_round_id,c.current_revision_id,c.pending_approval_id,
 b.batch_no,b.status batch_status,wo.id work_order_id,wo.work_order_no,b.product_id,
 wo.product_code_snapshot product_code,wo.product_name_snapshot product_name,wo.unit_snapshot unit`;
@Injectable()
export class MysqlProductionFinishedInboundRepository extends ProductionFinishedInboundRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly inventory: InventoryInboundCommand,
  ) {
    super();
  }
  list(query: FinishedGoodsInboundQuery) {
    return listFinishedOrders(this.pool, query);
  }
  get(id: string): Promise<FinishedGoodsInboundOrderDetail> {
    return withTransaction(this.pool, async (db) => {
      const order = await getFinishedOrder(db, id);
      const [[closeout]] = await db.query<(RowDataPacket & { id: number })[]>(
        'SELECT id FROM production_batch_closeout WHERE production_batch_id=?',
        [order.productionBatchId],
      );
      if (!closeout) throw new ProductionDomainError('INVALID_STATE', '成品入库来源已失效');
      const revisions = await readOutputRevisionsByIds(
        db,
        closeout.id,
        order.details.map((line) => line.outputRevisionId),
        this.inventory,
      );
      const revisionsById = new Map(revisions.map((revision) => [revision.id, revision]));
      return {
        ...order,
        details: order.details.map((line) => {
          const approvedOutput = revisionsById.get(line.outputRevisionId);
          if (!approvedOutput)
            throw new ProductionDomainError('INVALID_STATE', '成品入库批准依据已失效');
          return { ...line, approvedOutput };
        }),
      };
    });
  }
  async candidates(query: FinishedGoodsInboundCandidateQuery) {
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 20;
    const clauses = [
      "b.status IN ('completed','terminated')",
      `a.quantity>${finishedAllocationReceivedSql('a')}`,
      "round.status='finalized'",
      'c.current_round_id=round.id',
      'c.current_revision_id=r.id',
    ];
    const values: Array<string | number> = [];
    if (query.sourceType) {
      clauses.push('a.category=?');
      values.push(query.sourceType);
    }
    if (query.keyword?.trim()) {
      clauses.push(
        '(b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
      );
      values.push(...Array<string>(4).fill(`%${query.keyword.trim()}%`));
    }
    const where = clauses.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total ${ALLOCATION_SOURCE} WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<AllocationRow[]>(
      `SELECT ${ALLOCATION_COLUMNS},${finishedAllocationReceivedSql('a')} received_quantity ${ALLOCATION_SOURCE} WHERE ${where} ORDER BY b.id DESC,a.id LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items: rows.map((row) => candidate(row, String(row.received_quantity))),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }
  async confirm(payload: ConfirmFinishedGoodsInboundPayload, context: CommandContext) {
    if (!context.actorId || !payload.details.length || payload.details.length > 100)
      throw new ProductionDomainError('INVALID_INPUT', '请选择有效的成品入库明细');
    const totalByAllocation = new Map<string, number>();
    const detailKeys = new Set<string>();
    for (const line of payload.details) {
      if (!line.detailKey.trim() || detailKeys.has(line.detailKey))
        throw new ProductionDomainError('INVALID_INPUT', '入库明细标识必须唯一');
      detailKeys.add(line.detailKey);
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99_999_999)
        throw new ProductionDomainError('INVALID_INPUT', '每条入库数量须为正整数');
      if (
        line.target.mode === 'new'
          ? !line.target.clientKey.trim() || 'batchId' in line.target
          : !/^[1-9]\d*$/.test(line.target.batchId) || 'clientKey' in line.target
      )
        throw new ProductionDomainError('INVALID_INPUT', '请选择有效目标批次');
      totalByAllocation.set(
        line.allocationId,
        (totalByAllocation.get(line.allocationId) ?? 0) + line.quantity,
      );
    }
    if (
      [...totalByAllocation.values()].some(
        (value) => !Number.isSafeInteger(value) || value > 99_999_999,
      )
    )
      throw new ProductionDomainError('INVALID_INPUT', '同一授权本次数量过大');
    return withTransaction(this.pool, async (db) => {
      const closeout = await lockOutputBatch(db, payload.productionBatchId);
      if (
        !closeout.current_round_id ||
        !closeout.current_revision_id ||
        closeout.pending_approval_id !== null
      )
        throw new ProductionDomainError('INVALID_STATE', '当前任务没有可执行的成品授权');
      const [rows] = await db.query<AllocationRow[]>(
        `SELECT ${ALLOCATION_COLUMNS} ${ALLOCATION_SOURCE}
        WHERE c.production_batch_id=? AND a.id IN (${[...totalByAllocation.keys()].map(() => '?').join(',')}) ORDER BY a.id FOR UPDATE`,
        [payload.productionBatchId, ...totalByAllocation.keys()],
      );
      if (rows.length !== totalByAllocation.size)
        throw new ProductionDomainError('INVALID_STATE', '成品授权已变化，请刷新');
      for (const row of rows) {
        if (
          row.status !== 'finalized' ||
          String(row.round_id) !== String(row.current_round_id) ||
          String(row.revision_id) !== String(row.current_revision_id) ||
          !['completed', 'terminated'].includes(row.batch_status)
        )
          throw new ProductionDomainError('INVALID_STATE', '当前轮授权已冻结，请刷新');
      }
      const consumed = await this.inventory.readFinishedAllocationReceipts(
        rows.map((row) => String(row.id)),
        true,
      );
      for (const row of rows) {
        const spent = Number(consumed[String(row.id)] ?? '0');
        if (spent + (totalByAllocation.get(String(row.id)) ?? 0) > Number(row.quantity))
          throw new ProductionDomainError('INVALID_STATE', '成品授权剩余量不足，请刷新');
      }
      const source = rows[0]!;
      const byId = new Map(rows.map((row) => [String(row.id), row]));
      const result = await this.inventory.confirmFinishedOutput(
        {
          productionBatchId: payload.productionBatchId,
          workOrderId: String(source.work_order_id),
          productId: String(source.product_id),
          productCode: source.product_code,
          unit: source.unit,
          remark: payload.remark ?? null,
          details: payload.details.map((line) => {
            const row = byId.get(line.allocationId);
            if (!row || String(row.revision_id) !== line.revisionId)
              throw new ProductionDomainError('INVALID_STATE', '成品授权与批准版不匹配');
            return {
              detailKey: line.detailKey,
              allocationId: line.allocationId,
              revisionId: line.revisionId,
              sourceType: row.category,
              quantity: String(line.quantity),
              target: line.target,
            };
          }),
        },
        context,
      );
      return { inboundId: result.inboundId };
    });
  }
}
function candidate(row: AllocationRow, received: string): FinishedGoodsInboundCandidate {
  const remaining = Math.max(0, Number(row.quantity) - Number(received));
  const blockers: string[] = [];
  if (remaining === 0) blockers.push('本轮该授权已执行完');
  return {
    productionBatchId: String(row.production_batch_id),
    batchNo: row.batch_no,
    workOrderId: String(row.work_order_id),
    workOrderNo: row.work_order_no,
    productId: String(row.product_id),
    productCode: row.product_code,
    productName: row.product_name,
    unit: row.unit,
    sourceType: row.category,
    allocationId: String(row.id),
    outputRevisionId: String(row.revision_id),
    revisionNo: row.revision_no,
    authorizedQuantity: String(row.quantity),
    receivedQuantity: received,
    remainingQuantity: String(remaining),
    canConfirm: remaining > 0,
    blockers,
  };
}
