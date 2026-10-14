import { isDeepStrictEqual } from 'node:util';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { BatchCloseoutAction, BatchCloseoutDetail } from '@company/contracts';
import type { InventoryProductionDocumentCommand } from '../../../inventory/public.js';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { closeoutReviewBlockers } from '../../domain/production-closeout.policy.js';
import { findBatch } from '../tasks/mysql-production-batch.persistence.js';
import type { MysqlProductionTerminationRepository } from './mysql-production-termination.repository.js';
import type { CloseoutRow as Closeout } from './mysql-production-output.persistence.js';
import { loadCloseoutItems } from './mysql-production-closeout-items.js';
import {
  readTaskCloseoutWithdrawalCheck,
  taskCloseoutFactOf,
} from './mysql-production-closeout-task-actions.js';

type Action = RowDataPacket & {
  id: number;
  item_kind: BatchCloseoutAction['kind'];
  target_id: number;
  label: string;
  previous_status: string;
  resulting_status: string;
  reason: string;
  fact_snapshot: object | string;
  created_by: number;
  created_at: Date;
};
const nullableId = (value: number | null) => (value === null ? null : String(value));
const json = (value: object | string | null): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;

/** 在调用者的读取或写入事务内装配收尾事实，lock 原样传递以供写入复核。 */
export async function loadCloseoutDetail(
  db: PoolConnection,
  row: Closeout,
  lock: boolean,
  termination: Pick<MysqlProductionTerminationRepository, 'loadCheck'>,
  documents: InventoryProductionDocumentCommand,
): Promise<BatchCloseoutDetail> {
  const check = await termination.loadCheck(db, String(row.production_batch_id), lock);
  const [actions] = await db.query<Action[]>(
    `SELECT * FROM production_batch_closeout_action WHERE closeout_id=? ORDER BY id${lock ? ' FOR SHARE' : ''}`,
    [row.id],
  );
  const { demands, pendingItems, allocationDemands } = await loadCloseoutItems(
    db,
    check,
    lock,
    documents,
  );
  const materialReviews = check.materials.map((material) => {
    const reviewed = actions
      .filter(
        (action) =>
          action.item_kind === 'material' && String(action.target_id) === material.allocationId,
      )
      .at(-1);
    return {
      allocationId: material.allocationId,
      demandId: allocationDemands.get(material.allocationId)!,
      status: !reviewed
        ? ('pending' as const)
        : isDeepStrictEqual(json(reviewed.fact_snapshot), material)
          ? ('reviewed' as const)
          : ('stale' as const),
      reason: reviewed?.reason ?? null,
      actorId: reviewed ? String(reviewed.created_by) : null,
      reviewedAt: reviewed ? toBeijingISOString(reviewed.created_at) : null,
    };
  });
  const blockers = closeoutReviewBlockers(check, row.pending_approval_id !== null, materialReviews);
  const withdrawal = await readTaskCloseoutWithdrawalCheck(
    db,
    await findBatch(db, String(row.production_batch_id)),
    row,
    lock,
  );
  return {
    id: String(row.id),
    batchId: String(row.production_batch_id),
    reason: row.reason,
    version: row.version,
    approvalInstanceId: nullableId(row.approval_instance_id),
    pendingApprovalId: nullableId(row.pending_approval_id),
    mode: row.closeout_mode,
    currentRevisionId: nullableId(row.current_revision_id),
    demands,
    pendingItems,
    materialReviews,
    actions: actions.map((action) => {
      const fact = json(action.fact_snapshot) as {
        quantity?: string | number | null;
        unit?: string | null;
      };
      return {
        id: String(action.id),
        kind: action.item_kind,
        actionType:
          action.item_kind === 'task'
            ? (taskCloseoutFactOf(action.fact_snapshot)?.actionType ?? null)
            : null,
        entryActionId:
          action.item_kind === 'task'
            ? (taskCloseoutFactOf(action.fact_snapshot)?.entryActionId ?? null)
            : null,
        targetId: String(action.target_id),
        label: action.label,
        previousStatus: action.previous_status,
        resultingStatus: action.resulting_status,
        quantity:
          action.item_kind === 'material' || fact.quantity == null ? null : String(fact.quantity),
        unit: fact.unit ?? null,
        reason: action.reason,
        actorId: String(action.created_by),
        createdAt: toBeijingISOString(action.created_at),
      };
    }),
    check,
    canHandle:
      check.batchStatus === 'closing' &&
      row.pending_approval_id === null &&
      row.current_revision_id === null,
    canWithdraw: withdrawal.canWithdraw,
    withdrawBlockedReason: withdrawal.blockedReason,
    withdrawRestoredStatus: withdrawal.restoreStatus,
    blockers,
  };
}
