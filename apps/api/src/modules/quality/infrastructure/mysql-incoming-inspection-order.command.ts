import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  CreateQualityIncomingInspectionOrderResult,
  QualityIncomingInspectionAssociationChange,
  QualityIncomingInspectionAssociationResult,
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionOrderReference,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { allocateBusinessNumber } from '../../../infrastructure/numbering/mysql-business-number.js';
import { QualityIncomingInspectionOrderCommand } from '../application/quality-incoming-inspection-order.command.js';
import {
  normalizeIncomingInspectionOrderRemark,
  requireIncomingInspectionChanges,
  requireIncomingInspectionExpectedOrders,
  requireIncomingInspectionReceipts,
  requireIncomingInspectionVersion,
} from '../domain/incoming-inspection-order.policy.js';
import { QualityCommandError } from '../quality-command.error.js';

type OrderRow = RowDataPacket & {
  id: string;
  inspection_no: string;
  remark: string | null;
  created_by: string;
  created_at: Date;
  updated_by: string;
  updated_at: Date;
  version: number;
};
const ORDER_COLUMNS = 'id,inspection_no,remark,created_by,created_at,updated_by,updated_at,version';
const sortedIds = (ids: readonly string[]) =>
  [...new Set(ids)].sort((a, b) => {
    if (BigInt(a) < BigInt(b)) return -1;
    if (BigInt(a) > BigInt(b)) return 1;
    return 0;
  });
const reference = (
  order: QualityIncomingInspectionOrderItem,
): QualityIncomingInspectionOrderReference => ({
  id: order.id,
  inspectionNo: order.inspectionNo,
  version: order.version,
});

@Injectable()
export class MysqlIncomingInspectionOrderCommand extends QualityIncomingInspectionOrderCommand {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  create(
    payload: CreateQualityIncomingInspectionOrderPayload,
    context: CommandContext,
  ): Promise<CreateQualityIncomingInspectionOrderResult> {
    requireIncomingInspectionReceipts(payload.receipts);
    const remark = normalizeIncomingInspectionOrderRemark(payload.remark);
    const existingIds = payload.receipts.flatMap((receipt) =>
      receipt.fromOrderId === null ? [] : [receipt.fromOrderId],
    );
    const versions = requireIncomingInspectionExpectedOrders(payload.expectedOrders, existingIds);
    return this.inTransaction(async (db) => {
      const orders = await lockOrders(db, versions);
      await requireAssociations(db, payload.receipts);
      const inspectionNo = await allocateBusinessNumber(db, 'incoming_inspection_order');
      const [insert] = await db.execute<ResultSetHeader>(
        `INSERT INTO quality_incoming_inspection_order(inspection_no,remark,created_by,updated_by) VALUES(?,?,?,?)`,
        [inspectionNo, remark, context.actorId, context.actorId],
      );
      const id = String(insert.insertId);
      const changes = payload.receipts.map((receipt) => ({ ...receipt, toOrderId: id }));
      await writeAssociations(db, changes);
      const affectedOrders = await advanceOrders(db, orders, changes, context);
      const order = await readOrder(db, id);
      await audit(db, context, 'incoming-inspection-order.create', id, null, { order, changes });
      return { order, affectedOrders: [...affectedOrders, reference(order)], changes };
    });
  }

  changeAssociations(
    payload: ChangeQualityIncomingInspectionAssociationsPayload,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionAssociationResult> {
    requireIncomingInspectionChanges(payload.changes);
    const ids = payload.changes.flatMap((change) =>
      [change.fromOrderId, change.toOrderId].filter((id): id is string => id !== null),
    );
    const versions = requireIncomingInspectionExpectedOrders(payload.expectedOrders, ids);
    return this.inTransaction(async (db) => {
      const orders = await lockOrders(db, versions);
      await requireAssociations(db, payload.changes);
      const changes = payload.changes.filter((change) => change.fromOrderId !== change.toOrderId);
      await writeAssociations(db, changes);
      return { affectedOrders: await advanceOrders(db, orders, changes, context), changes };
    });
  }

  updateRemark(
    id: string,
    payload: UpdateQualityIncomingInspectionOrderPayload,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionOrderItem> {
    requireIncomingInspectionVersion(payload.expectedVersion);
    const remark = normalizeIncomingInspectionOrderRemark(payload.remark);
    return this.inTransaction(async (db) => {
      const before = (await lockOrders(db, new Map([[id, payload.expectedVersion]]))).get(id)!;
      if (before.remark === remark) return before;
      await db.execute(
        `UPDATE quality_incoming_inspection_order SET remark=?,updated_by=?,updated_at=NOW(3),version=version+1 WHERE id=? AND version=?`,
        [remark, context.actorId, id, payload.expectedVersion],
      );
      const after = await readOrder(db, id);
      await audit(db, context, 'incoming-inspection-order.remark', id, before, after);
      return after;
    });
  }

  private inTransaction<T>(run: (db: PoolConnection) => Promise<T>): Promise<T> {
    return withActiveConnection(this.pool, (db) => {
      if (db === this.pool || !('release' in db))
        throw new QualityCommandError('INVALID_STATE', '检验命令必须位于来源业务事务中');
      return run(db as PoolConnection);
    });
  }
}

async function readOrder(
  db: PoolConnection,
  id: string,
  lock = false,
): Promise<QualityIncomingInspectionOrderItem> {
  const [[row]] = await db.query<OrderRow[]>(
    `SELECT ${ORDER_COLUMNS} FROM quality_incoming_inspection_order WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!row) throw new QualityCommandError('NOT_FOUND', '质检主单不存在');
  return {
    id: String(row.id),
    inspectionNo: row.inspection_no,
    remark: row.remark,
    createdBy: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
    updatedBy: String(row.updated_by),
    updatedAt: toBeijingISOString(row.updated_at),
    version: Number(row.version),
  };
}

async function lockOrders(db: PoolConnection, versions: Map<string, number>) {
  const orders = new Map<string, QualityIncomingInspectionOrderItem>();
  for (const id of sortedIds([...versions.keys()])) {
    const order = await readOrder(db, id, true);
    if (order.version !== versions.get(id))
      throw new QualityCommandError('CONCURRENT_MODIFICATION', '质检主单已变化，请核对后重新提交');
    orders.set(id, order);
  }
  return orders;
}

async function requireAssociations(
  db: PoolConnection,
  receipts: readonly { receiptId: string; fromOrderId: string | null }[],
) {
  // Missing unique keys must not be gap-locked: independent new orders can share the same gap.
  // Receipt header locks serialize claims; the INSERT below asserts an expected unassigned source.
  const assigned = receipts.filter((receipt) => receipt.fromOrderId !== null);
  if (!assigned.length) return;
  const ids = sortedIds(assigned.map((receipt) => receipt.receiptId));
  const [rows] = await db.query<
    (RowDataPacket & { receipt_id: string; inspection_order_id: string })[]
  >(
    `SELECT receipt_id,inspection_order_id FROM quality_incoming_inspection_order_receipt WHERE receipt_id IN (${ids.map(() => '?').join(',')}) ORDER BY receipt_id FOR UPDATE`,
    ids,
  );
  const current = new Map(
    rows.map((row) => [String(row.receipt_id), String(row.inspection_order_id)]),
  );
  for (const receipt of assigned)
    if ((current.get(receipt.receiptId) ?? null) !== receipt.fromOrderId)
      throw new QualityCommandError(
        'CONCURRENT_MODIFICATION',
        '到货所属质检主单已变化，请核对后重新提交',
      );
}

async function writeAssociations(
  db: PoolConnection,
  changes: readonly QualityIncomingInspectionAssociationChange[],
) {
  // Source headers serialize concurrent claim/transfer attempts; deleting an association never deletes source facts.
  for (const change of changes) {
    if (change.fromOrderId !== null)
      await db.execute(
        'DELETE FROM quality_incoming_inspection_order_receipt WHERE inspection_order_id=? AND receipt_id=?',
        [change.fromOrderId, change.receiptId],
      );
    if (change.toOrderId !== null) {
      try {
        await db.execute(
          'INSERT INTO quality_incoming_inspection_order_receipt(inspection_order_id,receipt_id) VALUES(?,?)',
          [change.toOrderId, change.receiptId],
        );
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ER_DUP_ENTRY'
        )
          throw new QualityCommandError(
            'CONCURRENT_MODIFICATION',
            '到货所属质检主单已变化，请核对后重新提交',
          );
        throw error;
      }
    }
  }
}

async function advanceOrders(
  db: PoolConnection,
  orders: Map<string, QualityIncomingInspectionOrderItem>,
  changes: QualityIncomingInspectionAssociationChange[],
  context: CommandContext,
) {
  const affected: QualityIncomingInspectionOrderReference[] = [];
  for (const [id, before] of orders) {
    const localChanges = changes.filter(
      (change) => change.fromOrderId === id || change.toOrderId === id,
    );
    if (!localChanges.length) continue;
    await db.execute(
      'UPDATE quality_incoming_inspection_order SET updated_by=?,updated_at=NOW(3),version=version+1 WHERE id=? AND version=?',
      [context.actorId, id, before.version],
    );
    const after = await readOrder(db, id);
    await audit(
      db,
      context,
      'incoming-inspection-order.associations',
      id,
      {
        order: before,
        associations: localChanges.map(({ receiptId, fromOrderId }) => ({
          receiptId,
          orderId: fromOrderId,
        })),
      },
      { order: after, changes: localChanges },
    );
    affected.push(reference(after));
  }
  return affected;
}

async function audit(
  db: PoolConnection,
  context: CommandContext,
  action: string,
  id: string,
  beforeData: unknown,
  afterData: unknown,
) {
  await writeTransactionalAudit(db, {
    logType: 'business',
    module: 'quality',
    action,
    userId: context.actorId,
    targetId: id,
    targetType: 'quality-incoming-inspection-order',
    result: 'success',
    beforeData,
    afterData,
    ip: context.ip,
    requestId: context.requestId,
    userAgent: context.userAgent,
  });
}
