import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepStatus,
  PageResult,
  ProductionStepCommandResult,
  ProductionStepExecutionActionType,
  ProductionStepExecutionHistoryItem,
  ProductionStepHistoryCorrectionType,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import type { Db, BatchRow } from './mysql-production.shared.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';

/** 撤回派工核验是否曾登记报工；冲销后净量为零仍存在历史。 */
export const hasStepReportHistory = async (
  db: Db,
  stepRecordId: string,
  lock = false,
): Promise<boolean> => {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM batch_step_reports WHERE batch_step_record_id=? ORDER BY id LIMIT 1${lock ? ' FOR SHARE' : ''}`,
    [stepRecordId],
  );
  return rows.length > 0;
};

/** 先锁工单与任务，再锁结案根，随后才能锁工序。 */
export const requireUnfrozenStepActions = async (
  connection: PoolConnection,
  batchId: string,
): Promise<void> => {
  const [[closeout]] = await connection.query<
    (RowDataPacket & { pending_approval_id: number | null })[]
  >(
    'SELECT pending_approval_id FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE',
    [batchId],
  );
  if (closeout?.pending_approval_id != null)
    throw new ProductionDomainError('INVALID_STATE', '结案或产出更正在审批，工序状态及报工被冻结');
};

export interface ProductionStepExecutionState {
  status: BatchStepStatus;
  started_at: Date | null;
  completed_at: Date | null;
  version: number;
}

export const appendStepExecutionAction = async (
  connection: PoolConnection,
  input: {
    batchId: string;
    stepRecordId: string;
    actionType: ProductionStepExecutionActionType;
    reason?: string;
    actorId: string;
    before: ProductionStepExecutionState;
    after: ProductionStepExecutionState;
  },
): Promise<void> => {
  await connection.execute(
    `INSERT INTO batch_step_execution_actions
     (production_batch_id,batch_step_record_id,action_type,correction_type,before_status,after_status,
      before_started_at,after_started_at,before_completed_at,after_completed_at,reason,step_version,created_by)
     VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?)`,
    [
      input.batchId,
      input.stepRecordId,
      input.actionType,
      input.before.status,
      input.after.status,
      input.before.started_at,
      input.after.started_at,
      input.before.completed_at,
      input.after.completed_at,
      input.reason ?? null,
      input.after.version,
      input.actorId,
    ],
  );
};

type ActionHistoryRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  batch_step_record_id: number;
  source_type: ProductionStepExecutionHistoryItem['sourceType'];
  action_type: ProductionStepExecutionHistoryItem['actionType'];
  correction_type: ProductionStepHistoryCorrectionType | null;
  before_status: BatchStepStatus;
  after_status: BatchStepStatus;
  before_started_at: Date | null;
  after_started_at: Date | null;
  before_completed_at: Date | null;
  after_completed_at: Date | null;
  reason: string | null;
  step_version: number;
  created_by: number;
  created_at: Date;
};

const HISTORY_SELECT = `SELECT a.id,a.production_batch_id,a.batch_step_record_id,
  'execution_action' source_type,a.action_type,a.correction_type,a.before_status,a.after_status,
  a.before_started_at,a.after_started_at,a.before_completed_at,a.after_completed_at,a.reason,
  a.step_version,a.created_by,a.created_at
  FROM batch_step_execution_actions a WHERE a.production_batch_id=? AND a.batch_step_record_id=?
  UNION ALL
  SELECT a.id,c.production_batch_id,a.target_id batch_step_record_id,
  'closeout_action' source_type,'terminate' action_type,NULL correction_type,a.previous_status before_status,a.resulting_status after_status,
  NULL before_started_at,NULL after_started_at,NULL before_completed_at,NULL after_completed_at,a.reason,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(a.fact_snapshot,'$.version')) AS UNSIGNED)+1 step_version,a.created_by,a.created_at
  FROM production_batch_closeout_action a JOIN production_batch_closeout c ON c.id=a.closeout_id
  WHERE c.production_batch_id=? AND a.item_kind='step' AND a.target_id=?`;

/** 历史终止的旧快照没有业务时间，保持为空，不能从当前行猜造。 */
export const selectStepExecutionHistory = async (
  db: Db,
  batchId: string,
  stepRecordId: string,
  query: { page: number; pageSize: number },
): Promise<PageResult<ProductionStepExecutionHistoryItem>> => {
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM (${HISTORY_SELECT}) history`,
    [batchId, stepRecordId, batchId, stepRecordId],
  );
  const [rows] = await db.query<ActionHistoryRow[]>(
    `SELECT history.id,history.production_batch_id,history.batch_step_record_id,history.source_type,
      history.action_type,history.correction_type,history.before_status,history.after_status,
      history.before_started_at,history.after_started_at,history.before_completed_at,history.after_completed_at,
      history.reason,history.step_version,history.created_by,history.created_at
     FROM (${HISTORY_SELECT}) history ORDER BY history.created_at DESC,history.source_type,history.id DESC
     LIMIT ? OFFSET ?`,
    [
      batchId,
      stepRecordId,
      batchId,
      stepRecordId,
      query.pageSize,
      (query.page - 1) * query.pageSize,
    ],
  );
  return {
    items: rows.map((row) => ({
      actionId: String(row.id),
      productionBatchId: String(row.production_batch_id),
      stepRecordId: String(row.batch_step_record_id),
      sourceType: row.source_type,
      actionType: row.action_type,
      correctionType: row.correction_type,
      beforeStatus: row.before_status,
      afterStatus: row.after_status,
      beforeStartedAt: row.before_started_at ? toBeijingISOString(row.before_started_at) : null,
      afterStartedAt: row.after_started_at ? toBeijingISOString(row.after_started_at) : null,
      beforeCompletedAt: row.before_completed_at
        ? toBeijingISOString(row.before_completed_at)
        : null,
      afterCompletedAt: row.after_completed_at ? toBeijingISOString(row.after_completed_at) : null,
      reason: row.reason,
      stepVersion: row.step_version,
      createdById: String(row.created_by),
      createdByName: null,
      createdAt: toBeijingISOString(row.created_at),
    })),
    total: Number(count?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
};

export type ExecutionStepRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  step_order_snapshot: number;
  status: BatchStepStatus;
  responsible_user_id: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  version: number;
};
export const lockExecutionSteps = async (
  connection: PoolConnection,
  batchId: string,
): Promise<ExecutionStepRow[]> => {
  await connection.query(
    'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
    [batchId],
  );
  const [rows] = await connection.query<ExecutionStepRow[]>(
    `SELECT sr.id,sr.production_batch_id,sr.step_order_snapshot,sr.status,sr.responsible_user_id,
     sr.started_at,sr.completed_at,sr.version
     FROM batch_step_records sr WHERE sr.production_batch_id=? ORDER BY sr.step_order_snapshot,sr.id FOR UPDATE`,
    [batchId],
  );
  return rows;
};

export const lockExecutionStep = async (
  connection: Db,
  batchId: string,
  stepRecordId: string,
  lock = true,
): Promise<ExecutionStepRow> => {
  const [rows] = await connection.query<ExecutionStepRow[]>(
    `SELECT sr.id,sr.production_batch_id,sr.step_order_snapshot,sr.status,sr.responsible_user_id,
     sr.started_at,sr.completed_at,sr.version
     FROM batch_step_records sr WHERE sr.id=? AND sr.production_batch_id=?${lock ? ' FOR UPDATE' : ''}`,
    [stepRecordId, batchId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
  return rows[0];
};

export const stepAuditState = (step: ExecutionStepRow) => ({
  status: step.status,
  responsibleUserId: step.responsible_user_id === null ? null : String(step.responsible_user_id),
  startedAt: step.started_at ? toBeijingISOString(step.started_at) : null,
  completedAt: step.completed_at ? toBeijingISOString(step.completed_at) : null,
  version: step.version,
});

export const auditStep = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  stepRecordId: string,
  afterData: unknown,
  beforeData: unknown = null,
): Promise<void> =>
  writeTransactionalAudit(connection, {
    logType: 'business',
    module: 'production',
    action,
    userId: context.actorId,
    targetId: stepRecordId,
    targetType: 'batch_step_record',
    result: 'success',
    beforeData,
    afterData,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });

export const mapStepCommandResult = (
  batchId: string,
  batch: BatchRow,
  stepRecordId: string,
  step: ExecutionStepRow,
): ProductionStepCommandResult => ({
  productionBatchId: batchId,
  batchStatus: batch.status,
  batchVersion: batch.version,
  stepRecordId,
  stepStatus: step.status,
  responsibleUserId: step.responsible_user_id === null ? null : String(step.responsible_user_id),
  startedAt: step.started_at ? toBeijingISOString(step.started_at) : null,
  completedAt: step.completed_at ? toBeijingISOString(step.completed_at) : null,
  version: step.version,
});
