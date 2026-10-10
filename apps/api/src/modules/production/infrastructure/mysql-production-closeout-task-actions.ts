import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BatchCloseoutWithdrawalCheck,
  ProductionBatchStatus,
  ProductionCloseoutMode,
  ProductionTaskCloseoutActionType,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { findBatch, type BatchRow } from './mysql-production.shared.js';
import { CLOSEOUT_COLUMNS, type CloseoutRow } from './mysql-production-output.persistence.js';

type TaskState = {
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  closeoutMode: ProductionCloseoutMode | null;
  closeoutReason: string | null;
  closeoutVersion: number | null;
  executionCompletedAt: string | null;
  executionCompletedById: string | null;
};
export type TaskCloseoutActionFact = {
  actionType: ProductionTaskCloseoutActionType;
  entryActionId: string | null;
  before: TaskState;
  after: TaskState;
};
type TaskActionRow = RowDataPacket & {
  id: number;
  previous_status: ProductionBatchStatus;
  resulting_status: ProductionBatchStatus;
  fact_snapshot: TaskCloseoutActionFact | string;
};

export async function readTaskCloseoutEntry(
  db: PoolConnection,
  closeout: CloseoutRow,
  lock = false,
): Promise<TaskActionRow | null> {
  const [[action]] = await db.query<TaskActionRow[]>(
    `SELECT id,previous_status,resulting_status,fact_snapshot
     FROM production_batch_closeout_action WHERE closeout_id=? AND item_kind='task'
     ORDER BY id DESC LIMIT 1${lock ? ' FOR SHARE' : ''}`,
    [closeout.id],
  );
  if (!action) return null;
  const fact = taskCloseoutFactOf(action.fact_snapshot);
  if (
    fact?.actionType !== 'enter' ||
    action.resulting_status !== 'closing' ||
    fact.before?.batchStatus !== action.previous_status ||
    !['material_partially_outbound', 'material_outbound', 'doing'].includes(action.previous_status)
  )
    return null;
  return action;
}

export async function readTaskCloseoutWithdrawalCheck(
  db: PoolConnection,
  batch: BatchRow,
  closeout: CloseoutRow | null,
  lock = false,
): Promise<BatchCloseoutWithdrawalCheck> {
  const entry = closeout ? await readTaskCloseoutEntry(db, closeout, lock) : null;
  const blockedReason =
    batch.status !== 'closing'
      ? '只有结案中的任务可以撤回本次结束'
      : !closeout
        ? '结案记录不存在'
        : closeout.current_revision_id !== null
          ? '结案已经批准，不能恢复任务执行'
          : closeout.pending_approval_id !== null
            ? '结案正在审批，请先撤回或驳回审批申请'
            : !entry
              ? '缺少本次进入结案的行动依据，不能推断恢复阶段'
              : null;
  return {
    batchId: String(batch.id),
    batchStatus: batch.status,
    version: batch.version,
    closeoutId: closeout ? String(closeout.id) : null,
    closeoutVersion: closeout?.version ?? null,
    restoreStatus: entry?.previous_status ?? null,
    canWithdraw: blockedReason === null,
    blockedReason,
  };
}

/** 普通结束与提前停止共用唯一根，重入保留原产出、检验、轮次和子事项处理。 */
export async function enterTaskCloseout(
  db: PoolConnection,
  batch: BatchRow,
  expectedCloseoutVersion: number | null,
  mode: ProductionCloseoutMode,
  reason: string,
  actorId: string,
): Promise<{ closeoutId: string; entryActionId: string }> {
  const [[existing]] = await db.query<CloseoutRow[]>(
    `SELECT ${CLOSEOUT_COLUMNS} FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE`,
    [batch.id],
  );
  if ((existing?.version ?? null) !== expectedCloseoutVersion)
    throw new ProductionDomainError(
      'CONCURRENT_MODIFICATION',
      '结案草稿已变化，请刷新核对后重新结束',
    );
  if (existing && existing.pending_approval_id !== null)
    throw new ProductionDomainError('INVALID_STATE', '结案正在审批，不能再次进入结案');
  if (existing && existing.current_revision_id !== null)
    throw new ProductionDomainError('INVALID_STATE', '结案已经批准，不能再次结束执行');
  let closeoutId: string;
  if (existing) {
    const [updated] = await db.execute<ResultSetHeader>(
      `UPDATE production_batch_closeout SET closeout_mode=?,reason=?,review_snapshot=NULL,
       version=version+1,updated_by=? WHERE id=? AND version=?
       AND pending_approval_id IS NULL AND current_revision_id IS NULL`,
      [mode, reason, actorId, existing.id, existing.version],
    );
    assertTaskActionVersion(updated);
    closeoutId = String(existing.id);
  } else {
    const [created] = await db.execute<ResultSetHeader>(
      `INSERT INTO production_batch_closeout
       (production_batch_id,closeout_mode,reason,created_by,updated_by) VALUES (?,?,?,?,?)`,
      [batch.id, mode, reason, actorId, actorId],
    );
    closeoutId = String(created.insertId);
  }
  const [updatedBatch] = await db.execute<ResultSetHeader>(
    `UPDATE production_batches SET status='closing',
     execution_completed_at=${mode === 'normal' ? 'NOW()' : 'NULL'},
     execution_completed_by=?,version=version+1,updated_by=? WHERE id=? AND version=? AND status=?`,
    [mode === 'normal' ? actorId : null, actorId, batch.id, batch.version, batch.status],
  );
  assertTaskActionVersion(updatedBatch);
  const afterBatch = await findBatch(db, String(batch.id), true);
  const [[afterCloseout]] = await db.query<CloseoutRow[]>(
    `SELECT ${CLOSEOUT_COLUMNS} FROM production_batch_closeout WHERE id=? FOR UPDATE`,
    [closeoutId],
  );
  if (!afterCloseout) throw new ProductionDomainError('CONFLICT', '结案根未建立');
  const entryActionId = await appendTaskCloseoutAction(db, {
    closeoutId,
    batchId: String(batch.id),
    actorId,
    label: mode === 'normal' ? '正常执行结束' : '提前结束',
    reason,
    fact: {
      actionType: 'enter',
      entryActionId: null,
      before: taskStateOf(batch, existing ?? null),
      after: taskStateOf(afterBatch, afterCloseout),
    },
  });
  return { closeoutId, entryActionId };
}

export async function appendTaskCloseoutAction(
  db: PoolConnection,
  input: {
    closeoutId: string;
    batchId: string;
    actorId: string;
    label: string;
    reason: string;
    fact: TaskCloseoutActionFact;
  },
): Promise<string> {
  const [created] = await db.execute<ResultSetHeader>(
    `INSERT INTO production_batch_closeout_action
     (closeout_id,item_kind,target_id,label,previous_status,resulting_status,reason,fact_snapshot,created_by)
     VALUES (?,'task',?,?,?,?,?,?,?)`,
    [
      input.closeoutId,
      input.batchId,
      input.label,
      input.fact.before.batchStatus,
      input.fact.after.batchStatus,
      input.reason,
      JSON.stringify(input.fact),
      input.actorId,
    ],
  );
  return String(created.insertId);
}

export function taskStateOf(batch: BatchRow, closeout: CloseoutRow | null): TaskState {
  return {
    batchStatus: batch.status,
    batchVersion: batch.version,
    closeoutMode: closeout?.closeout_mode ?? null,
    closeoutReason: closeout?.reason ?? null,
    closeoutVersion: closeout?.version ?? null,
    executionCompletedAt: batch.execution_completed_at
      ? toBeijingISOString(batch.execution_completed_at)
      : null,
    executionCompletedById:
      batch.execution_completed_by === null ? null : String(batch.execution_completed_by),
  };
}

export function taskCloseoutFactOf(value: unknown): TaskCloseoutActionFact | null {
  try {
    const fact: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (typeof fact !== 'object' || fact === null) return null;
    const actionType = (fact as { actionType?: unknown }).actionType;
    if (actionType !== 'enter' && actionType !== 'withdraw') return null;
    return fact as TaskCloseoutActionFact;
  } catch {
    return null;
  }
}

export function assertTaskActionVersion(result: ResultSetHeader): void {
  if (result.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '任务或结案记录已变化，请刷新核对');
}
