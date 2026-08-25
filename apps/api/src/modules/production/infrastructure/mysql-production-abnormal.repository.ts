import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ApproveBatchStepReworkPayload,
  BatchStepAbnormalDispositionItem,
  CompleteReworkPayload,
  CompleteReworkResult,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionAbnormalRepository } from '../application/ports/production-abnormal.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { isRequiredNormalCompleted } from '../domain/production-reporting.policy.js';
import { requireReworkCompletionQuantities } from '../domain/production-rework.policy.js';
import { findBatch } from './mysql-production.shared.js';
import {
  mapDisposition,
  mapReport,
  type DispositionRow,
  type ReportRow,
} from './mysql-production-reporting.projection.js';
import { add, fixed } from './mysql-production-reporting-quantity.js';

type ReworkRow = RowDataPacket & {
  id: number;
  rework_no: string;
  abnormal_disposition_id: number;
  production_batch_id: number;
  batch_step_record_id: number;
  source_report_id: number;
  responsible_user_id: number;
  rework_quantity: string;
  unit_snapshot: string;
  status: ReworkRecordItem['status'];
  completed_report_id: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  version: number;
  remark: string | null;
  created_at: Date;
};

type DispositionSourceRow = DispositionRow & {
  reported_quantity: string;
  normal_quantity: string;
  abnormal_quantity: string;
  unit_snapshot: string;
  report_type: 'normal' | 'reversal';
  is_effective: number;
  is_direct_report: number;
  responsible_user_id: number | null;
};

type StepAggregateRow = RowDataPacket & {
  id: number;
  status: string;
  version: number;
  effective_normal: string;
};

@Injectable()
export class MysqlProductionAbnormalRepository extends ProductionAbnormalRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listReworks(batchId: string): Promise<ReworkRecordItem[]> {
    await findBatch(this.pool, batchId);
    const [rows] = await this.pool.query<ReworkRow[]>(
      `${REWORK_SELECT} WHERE rw.production_batch_id=? ORDER BY rw.created_at,rw.id`,
      [batchId],
    );
    return rows.map(mapRework);
  }

  approveRework(
    dispositionId: string,
    payload: ApproveBatchStepReworkPayload,
    context: CommandContext,
  ): Promise<ReworkRecordItem> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      await lockDispositionContext(connection, dispositionId);
      const source = await selectDispositionSource(connection, dispositionId, true);
      if (source.review_status === 'approved' && source.disposition_type === 'rework') {
        return selectReworkByDisposition(connection, dispositionId);
      }
      if (source.review_status !== 'pending_review')
        throw new ProductionDomainError('INVALID_STATE', '只有待处置异常可以批准返工');
      if (source.version !== payload.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '异常处置单已变化，请刷新后重试',
        );
      requireEffectiveAbnormalSource(source);
      if (source.responsible_user_id === null)
        throw new ProductionDomainError('INVALID_STATE', '来源工序没有负责人，不能创建返工单');
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE batch_step_abnormal_dispositions
         SET review_status='approved',disposition_type='rework',reviewed_by=?,reviewed_at=NOW(),remark=?,version=version+1,updated_by=?
         WHERE id=? AND review_status='pending_review' AND version=?`,
        [actorId, payload.remark ?? null, actorId, dispositionId, payload.version],
      );
      if (updated.affectedRows !== 1) throw concurrentDisposition();
      const [created] = await connection.execute<ResultSetHeader>(
        `INSERT INTO rework_records
         (rework_no,abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id,responsible_user_id,rework_quantity,unit_snapshot,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?)`,
        [
          `RW-${Date.now()}-${randomUUID().slice(0, 8)}`,
          dispositionId,
          source.production_batch_id,
          source.batch_step_record_id,
          source.batch_step_report_id,
          source.responsible_user_id,
          source.abnormal_quantity,
          source.unit_snapshot,
          payload.remark ?? null,
          actorId,
          actorId,
        ],
      );
      await audit(connection, context, 'production-abnormal.approve-rework', dispositionId, {
        reworkId: String(created.insertId),
        sourceReportId: String(source.batch_step_report_id),
        reworkQuantity: source.abnormal_quantity,
      });
      return selectRework(connection, String(created.insertId));
    });
  }

  rejectDisposition(
    dispositionId: string,
    payload: RejectBatchStepAbnormalDispositionPayload,
    context: CommandContext,
  ): Promise<BatchStepAbnormalDispositionItem> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      await lockDispositionContext(connection, dispositionId);
      const source = await selectDispositionSource(connection, dispositionId, true);
      if (source.review_status === 'rejected') return mapDisposition(source);
      if (source.review_status !== 'pending_review')
        throw new ProductionDomainError('INVALID_STATE', '只有待处置异常可以驳回');
      if (source.version !== payload.version) throw concurrentDisposition();
      requireRejectableDirectAbnormalSource(source);
      const reversalReportId = await insertRejectedSourceReversal(
        connection,
        source,
        payload.reason,
        actorId,
      );
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE batch_step_abnormal_dispositions
         SET review_status='rejected',disposition_type=NULL,reviewed_by=?,reviewed_at=NOW(),remark=?,version=version+1,updated_by=?
         WHERE id=? AND review_status='pending_review' AND version=?`,
        [actorId, payload.reason, actorId, dispositionId, payload.version],
      );
      if (updated.affectedRows !== 1) throw concurrentDisposition();
      await audit(connection, context, 'production-abnormal.reject', dispositionId, {
        reason: payload.reason,
        sourceReportId: String(source.batch_step_report_id),
        reversalReportId,
      });
      return mapDisposition(await selectDispositionSource(connection, dispositionId));
    });
  }

  startRework(
    reworkId: string,
    version: number,
    context: CommandContext,
  ): Promise<ReworkRecordItem> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      await lockReworkContext(connection, reworkId);
      const row = await selectRework(connection, reworkId, true);
      if (row.status === 'doing') return row;
      requireReworkActor(row, actorId);
      if (row.status !== 'pending')
        throw new ProductionDomainError('INVALID_STATE', '只有待返工单可以开始');
      if (row.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '返工单已变化，请刷新后重试');
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE rework_records SET status='doing',started_at=NOW(),version=version+1,updated_by=?
         WHERE id=? AND status='pending' AND version=?`,
        [actorId, reworkId, version],
      );
      if (updated.affectedRows !== 1) throw concurrentRework();
      await audit(connection, context, 'production-rework.start', reworkId, { status: 'doing' });
      return selectRework(connection, reworkId);
    });
  }

  completeRework(
    reworkId: string,
    payload: CompleteReworkPayload,
    context: CommandContext,
  ): Promise<CompleteReworkResult> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      const batch = await lockReworkContext(connection, reworkId);
      const rework = await selectRework(connection, reworkId, true);
      requireReworkActor(rework, actorId);
      if (rework.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '只有返工中的单据可以完成');
      if (rework.version !== payload.version) throw concurrentRework();
      requireReworkCompletionQuantities(
        rework.reworkQuantity,
        payload.normalQuantity,
        payload.abnormalQuantity,
      );
      const step = await selectStepAggregate(connection, rework.stepRecordId);
      const nextNormal = add(step.effective_normal, payload.normalQuantity);
      if (integerQuantity(nextNormal) > integerQuantity(batch.planned_quantity))
        throw new ProductionDomainError(
          'STEP_REPORT_QUANTITY_EXCEEDED',
          '返工正常数量超过工序计划量',
        );
      const reportId = await insertReworkReport(connection, rework, payload, actorId);
      const dispositionId =
        payload.abnormalQuantity > 0
          ? await insertDisposition(connection, rework, reportId, actorId)
          : null;
      const completed = isRequiredNormalCompleted(nextNormal, batch.planned_quantity);
      await connection.execute(
        `UPDATE batch_step_records
         SET status=?,completed_at=${completed ? 'COALESCE(completed_at,NOW())' : 'NULL'},version=version+1,updated_by=?
         WHERE id=?`,
        [completed ? 'completed' : 'doing', actorId, rework.stepRecordId],
      );
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE rework_records
         SET status='completed',completed_report_id=?,completed_at=NOW(),version=version+1,remark=?,updated_by=?
         WHERE id=? AND status='doing' AND version=?`,
        [reportId, payload.remark ?? rework.remark, actorId, reworkId, payload.version],
      );
      if (updated.affectedRows !== 1) throw concurrentRework();
      await audit(connection, context, 'production-rework.complete', reworkId, {
        reportId,
        normalQuantity: fixed(payload.normalQuantity),
        abnormalQuantity: fixed(payload.abnormalQuantity),
      });
      return {
        rework: await selectRework(connection, reworkId),
        report: mapReport(await selectReport(connection, reportId)),
        abnormalDisposition: dispositionId
          ? mapDisposition(await selectDispositionSource(connection, dispositionId))
          : null,
      };
    });
  }
}

const lockDispositionContext = async (
  connection: PoolConnection,
  dispositionId: string,
): Promise<void> => {
  const [[identity]] = await connection.query<(RowDataPacket & { production_batch_id: number })[]>(
    'SELECT production_batch_id FROM batch_step_abnormal_dispositions WHERE id=?',
    [dispositionId],
  );
  if (!identity) throw new ProductionDomainError('NOT_FOUND', '异常处置单不存在');
  const batch = await findBatch(connection, String(identity.production_batch_id), true);
  if (batch.status !== 'doing')
    throw new ProductionDomainError('INVALID_STATE', '只有生产执行中的异常可以处置');
  await lockBatchSteps(connection, String(identity.production_batch_id));
};

const lockReworkContext = async (connection: PoolConnection, reworkId: string) => {
  const [[identity]] = await connection.query<(RowDataPacket & { production_batch_id: number })[]>(
    'SELECT production_batch_id FROM rework_records WHERE id=?',
    [reworkId],
  );
  if (!identity) throw new ProductionDomainError('NOT_FOUND', '返工单不存在');
  const batch = await findBatch(connection, String(identity.production_batch_id), true);
  if (batch.status !== 'doing')
    throw new ProductionDomainError('INVALID_STATE', '只有生产执行中的返工单可以操作');
  await lockBatchSteps(connection, String(identity.production_batch_id));
  return batch;
};

const lockBatchSteps = (connection: PoolConnection, batchId: string) =>
  connection.query(
    'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
    [batchId],
  );

const selectDispositionSource = async (
  connection: PoolConnection,
  dispositionId: string,
  lock = false,
): Promise<DispositionSourceRow> => {
  const [rows] = await connection.query<DispositionSourceRow[]>(
    `${DISPOSITION_SOURCE_SELECT} WHERE d.id=?${lock ? ' FOR UPDATE' : ''}`,
    [dispositionId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '异常处置单不存在');
  return rows[0];
};

const requireEffectiveAbnormalSource = (source: DispositionSourceRow): void => {
  if (
    source.report_type !== 'normal' ||
    !source.is_effective ||
    integerQuantity(source.abnormal_quantity) <= 0
  )
    throw new ProductionDomainError('INVALID_STATE', '来源异常报工已失效或没有异常数量');
};

const requireRejectableDirectAbnormalSource = (source: DispositionSourceRow): void => {
  requireEffectiveAbnormalSource(source);
  if (!source.is_direct_report || integerQuantity(source.normal_quantity) > 0)
    throw new ProductionDomainError(
      'INVALID_STATE',
      '该异常来自返工完成或历史混合报工，不能整笔驳回，请使用报工更正流程',
    );
};

const insertRejectedSourceReversal = async (
  connection: PoolConnection,
  source: DispositionSourceRow,
  reason: string,
  actorId: string,
): Promise<string> => {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO batch_step_reports
     (report_no,production_batch_id,batch_step_record_id,report_type,reversal_of_report_id,replaces_report_id,reported_quantity,normal_quantity,abnormal_quantity,abnormal_origin,unit_snapshot,remark,created_by)
     VALUES (?,?,?,'reversal',?,NULL,?,?,?,?,?,?,?)`,
    [
      `SR-${Date.now()}-${randomUUID().slice(0, 12)}`,
      source.production_batch_id,
      source.batch_step_record_id,
      source.batch_step_report_id,
      source.reported_quantity,
      source.normal_quantity,
      source.abnormal_quantity,
      source.abnormal_origin,
      source.unit_snapshot,
      reason,
      actorId,
    ],
  );
  await connection.execute(
    'UPDATE batch_step_records SET version=version+1,updated_by=? WHERE id=?',
    [actorId, source.batch_step_record_id],
  );
  return String(result.insertId);
};

const selectRework = async (
  connection: PoolConnection,
  reworkId: string,
  lock = false,
): Promise<ReworkRecordItem> => {
  const [rows] = await connection.query<ReworkRow[]>(
    `${REWORK_SELECT} WHERE rw.id=?${lock ? ' FOR UPDATE' : ''}`,
    [reworkId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '返工单不存在');
  return mapRework(rows[0]);
};

const selectReworkByDisposition = async (
  connection: PoolConnection,
  dispositionId: string,
): Promise<ReworkRecordItem> => {
  const [rows] = await connection.query<ReworkRow[]>(
    `${REWORK_SELECT} WHERE rw.abnormal_disposition_id=?`,
    [dispositionId],
  );
  if (!rows[0]) throw new ProductionDomainError('INVALID_STATE', '已批准处置缺少返工事实');
  return mapRework(rows[0]);
};

const mapRework = (row: ReworkRow): ReworkRecordItem => ({
  reworkId: String(row.id),
  reworkNo: row.rework_no,
  abnormalDispositionId: String(row.abnormal_disposition_id),
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  sourceReportId: String(row.source_report_id),
  responsibleUserId: String(row.responsible_user_id),
  responsibleUserName: null,
  reworkQuantity: row.rework_quantity,
  unit: row.unit_snapshot,
  status: row.status,
  completedReportId: row.completed_report_id === null ? null : String(row.completed_report_id),
  startedAt: row.started_at ? toBeijingISOString(row.started_at) : null,
  completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
  version: row.version,
  remark: row.remark,
  createdAt: toBeijingISOString(row.created_at),
});

const requireReworkActor = (row: ReworkRecordItem, actorId: string): void => {
  if (row.responsibleUserId !== actorId)
    throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '只有返工负责人可以执行返工');
};

const selectStepAggregate = async (
  connection: PoolConnection,
  stepRecordId: string,
): Promise<StepAggregateRow> => {
  const [rows] = await connection.query<StepAggregateRow[]>(
    `SELECT sr.id,sr.status,sr.version,
      COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END),0) effective_normal
     FROM batch_step_records sr LEFT JOIN batch_step_reports r ON r.batch_step_record_id=sr.id
     WHERE sr.id=? GROUP BY sr.id`,
    [stepRecordId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '返工工序不存在');
  return rows[0];
};

const insertReworkReport = async (
  connection: PoolConnection,
  rework: ReworkRecordItem,
  payload: CompleteReworkPayload,
  actorId: string,
): Promise<string> => {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO batch_step_reports
     (report_no,production_batch_id,batch_step_record_id,report_type,reported_quantity,normal_quantity,abnormal_quantity,abnormal_origin,unit_snapshot,remark,created_by)
     VALUES (?,?,?,'normal',?,?,?,?,?,?,?)`,
    [
      `SR-RW-${Date.now()}-${randomUUID().slice(0, 10)}`,
      rework.productionBatchId,
      rework.stepRecordId,
      fixed(payload.normalQuantity + payload.abnormalQuantity),
      fixed(payload.normalQuantity),
      fixed(payload.abnormalQuantity),
      payload.abnormalQuantity > 0 ? 'current_step' : null,
      rework.unit,
      payload.remark ?? `返工单 ${rework.reworkNo} 完成报工`,
      actorId,
    ],
  );
  return String(result.insertId);
};

const insertDisposition = async (
  connection: PoolConnection,
  rework: ReworkRecordItem,
  reportId: string,
  actorId: string,
): Promise<string> => {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO batch_step_abnormal_dispositions
     (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,review_status,created_by,updated_by)
     VALUES (?,?,?,?,'pending_review',?,?)`,
    [
      `BAD-${Date.now()}-${randomUUID().slice(0, 12)}`,
      rework.productionBatchId,
      rework.stepRecordId,
      reportId,
      actorId,
      actorId,
    ],
  );
  return String(result.insertId);
};

const selectReport = async (connection: PoolConnection, reportId: string): Promise<ReportRow> => {
  const [rows] = await connection.query<ReportRow[]>(`${REPORT_SELECT} WHERE r.id=?`, [reportId]);
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '返工报工事实不存在');
  return rows[0];
};

const requireActor = (context: CommandContext): string => {
  if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
  return context.actorId;
};

const concurrentDisposition = () =>
  new ProductionDomainError('CONCURRENT_MODIFICATION', '异常处置单已变化，请刷新后重试');
const concurrentRework = () =>
  new ProductionDomainError('CONCURRENT_MODIFICATION', '返工单已变化，请刷新后重试');

const audit = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  targetId: string,
  afterData: unknown,
) =>
  writeTransactionalAudit(connection, {
    logType: 'business',
    module: 'production',
    action,
    userId: context.actorId,
    targetId,
    targetType: action.startsWith('production-rework') ? 'rework_record' : 'abnormal_disposition',
    result: 'success',
    beforeData: null,
    afterData,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });

const REWORK_SELECT = `SELECT rw.id,rw.rework_no,rw.abnormal_disposition_id,rw.production_batch_id,
  rw.batch_step_record_id,rw.source_report_id,rw.responsible_user_id,rw.rework_quantity,
  rw.unit_snapshot,rw.status,rw.completed_report_id,rw.started_at,rw.completed_at,rw.version,
  rw.remark,rw.created_at FROM rework_records rw`;

const DISPOSITION_SOURCE_SELECT = `SELECT d.id,d.disposition_no,d.production_batch_id,
  d.batch_step_record_id,d.batch_step_report_id,d.review_status,d.disposition_type,d.remark,d.version,
  d.created_at,r.reported_quantity,r.normal_quantity,r.abnormal_quantity,r.abnormal_origin,r.unit_snapshot,r.report_type,
  CASE WHEN NOT EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=r.id) THEN 1 ELSE 0 END is_effective,
  CASE WHEN r.replaces_report_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM rework_records completed_rework WHERE completed_rework.completed_report_id=r.id)
    THEN 1 ELSE 0 END is_direct_report,
  sr.responsible_user_id
  FROM batch_step_abnormal_dispositions d
  JOIN batch_step_reports r ON r.id=d.batch_step_report_id
  JOIN batch_step_records sr ON sr.id=d.batch_step_record_id`;

const REPORT_SELECT = `SELECT r.id,r.report_no,r.production_batch_id,r.batch_step_record_id,
  r.report_type,r.reversal_of_report_id,r.replaces_report_id,r.reported_quantity,r.normal_quantity,
  r.abnormal_quantity,r.abnormal_origin,r.unit_snapshot,r.remark,r.created_by,r.created_at,
  CASE WHEN r.report_type='reversal' THEN 1 WHEN NOT EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=r.id) THEN 1 ELSE 0 END is_effective
  FROM batch_step_reports r`;
