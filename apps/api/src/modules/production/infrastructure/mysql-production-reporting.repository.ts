import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepReportCommandResult,
  BatchStepStatus,
  CorrectBatchStepReportCommandResult,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  ProductionBatchQuery,
  ProductionExecutionRecordGroup,
  ReverseBatchStepReportPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionReportingRepository } from '../application/ports/production-reporting.repository.js';
import {
  isRequiredNormalCompleted,
  requireNoDownstreamQuantityConflict,
  requireReportWithinReleased,
  requireReportQuantities,
} from '../domain/production-reporting.policy.js';
import {
  calculateRouteStepQuantities,
  type RouteQuantityStep,
} from '../domain/production-route-quantity.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { findBatch } from './mysql-production.shared.js';
import { selectExecutionBatchSummaries } from './mysql-production-reporting-batch.projection.js';
import {
  groupRowsBy,
  mapDisposition,
  mapExecutionStep,
  mapReport,
  type DispositionRow,
  type ProjectionStepRow,
  type ReportRow,
} from './mysql-production-reporting.projection.js';
import { add, fixed, subtract } from './mysql-production-reporting-quantity.js';
import { selectRouteSupplementSources } from './mysql-production-supplement-activation.js';

type LockedStepRow = RowDataPacket & {
  id: number;
  step_order_snapshot: number;
  status: BatchStepStatus;
  responsible_user_id: number | null;
  need_record_snapshot: number;
  unit_snapshot: string;
  effective_reported: string;
  effective_direct_reported: string;
  effective_normal: string;
  effective_abnormal: string;
  version: number;
};
@Injectable()
export class MysqlProductionReportingRepository extends ProductionReportingRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  listExecutionBatches(query: ProductionBatchQuery) {
    return selectExecutionBatchSummaries(this.pool, query);
  }

  async getBatchExecution(batchId: string): Promise<ProductionExecutionRecordGroup> {
    const batch = await findBatch(this.pool, batchId);
    const [steps] = await this.pool.query<ProjectionStepRow[]>(PROJECTION_STEP_SELECT, [batchId]);
    const [reports] = await this.pool.query<ReportRow[]>(REPORT_SELECT_BATCH, [batchId]);
    const [dispositions] = await this.pool.query<DispositionRow[]>(DISPOSITION_SELECT_BATCH, [
      batchId,
    ]);
    const supplements =
      (await selectRouteSupplementSources(this.pool, [batchId])).get(batchId) ?? [];
    const quantities = calculateRouteStepQuantities(
      batch.planned_quantity,
      steps.map(toRouteQuantityStep),
      supplements,
    );
    const reportsByStep = groupRowsBy(reports, (row) => String(row.batch_step_record_id));
    const dispositionsByStep = groupRowsBy(dispositions, (row) => String(row.batch_step_record_id));
    return {
      productionBatchId: batchId,
      batchNo: batch.batch_no,
      workOrderId: String(batch.work_order_id),
      workOrderNo: batch.work_order_no,
      productCode: batch.product_code_snapshot,
      productName: batch.product_name_snapshot,
      batchStatus: batch.status,
      plannedQuantity: batch.planned_quantity,
      steps: steps.map((step) =>
        mapExecutionStep(
          step,
          batch.planned_quantity,
          quantities.get(String(step.id))!,
          reportsByStep.get(String(step.id)) ?? [],
          dispositionsByStep.get(String(step.id)) ?? [],
        ),
      ),
    };
  }

  createReport(
    batchId: string,
    stepRecordId: string,
    payload: CreateBatchStepReportPayload,
    context: CommandContext & { actorId: string },
  ): Promise<BatchStepReportCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const { current, required, released } = await lockContext(connection, batchId, stepRecordId);
      if (current.status !== 'doing' || String(current.responsible_user_id) !== context.actorId)
        throw new ProductionDomainError(
          current.status !== 'doing' ? 'STEP_REPORT_NOT_ALLOWED' : 'NOT_STEP_ASSIGNEE',
          current.status !== 'doing' ? '只有进行中的工序可以报工' : '只有当前负责人可以报工',
        );
      if (!current.need_record_snapshot)
        throw new ProductionDomainError('STEP_REPORT_NOT_ALLOWED', '该工序无需报工');
      assertVersion(current, payload.version);
      requireReportQuantities(payload.normalQuantity, payload.abnormalQuantity);
      requireReportWithinReleased(
        current.effective_direct_reported,
        payload.normalQuantity,
        payload.abnormalQuantity,
        released,
      );
      const reportId = await insertReport(connection, {
        batchId,
        stepRecordId,
        reportType: 'normal',
        normalQuantity: payload.normalQuantity,
        abnormalQuantity: payload.abnormalQuantity,
        unit: current.unit_snapshot,
        remark: payload.remark ?? null,
        actorId: context.actorId,
      });
      const dispositionId =
        payload.abnormalQuantity > 0
          ? await insertDisposition(connection, batchId, stepRecordId, reportId, context.actorId)
          : null;
      await updateStepAfterFacts(
        connection,
        current,
        add(current.effective_normal, payload.normalQuantity),
        required,
        context.actorId,
      );
      await audit(connection, context, 'production-step-report.create', reportId, {
        batchId,
        stepRecordId,
        normalQuantity: fixed(payload.normalQuantity),
        abnormalQuantity: fixed(payload.abnormalQuantity),
      });
      return commandResult(
        connection,
        batchId,
        stepRecordId,
        required,
        released,
        reportId,
        dispositionId,
      );
    });
  }

  reverseReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: ReverseBatchStepReportPayload,
    context: CommandContext,
  ): Promise<BatchStepReportCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      const { current, required, released, downstream } = await lockContext(
        connection,
        batchId,
        stepRecordId,
      );
      const target = await lockReport(connection, batchId, stepRecordId, reportId);
      const existing = await findReversal(connection, reportId);
      if (existing)
        return commandResult(
          connection,
          batchId,
          stepRecordId,
          required,
          released,
          String(existing.id),
          null,
        );
      requireCorrectable(target);
      assertVersion(current, payload.version);
      const correctedNormal = subtract(current.effective_normal, target.normal_quantity);
      requireNoDownstreamQuantityConflict(
        correctedNormal,
        downstream?.effective_direct_reported ?? 0,
      );
      const reversalId = await insertReport(connection, {
        batchId,
        stepRecordId,
        reportType: 'reversal',
        normalQuantity: Number(target.normal_quantity),
        abnormalQuantity: Number(target.abnormal_quantity),
        unit: target.unit_snapshot,
        remark: payload.reason,
        actorId,
        reversalOfReportId: reportId,
      });
      await updateStepAfterFacts(connection, current, correctedNormal, required, actorId);
      await audit(connection, context, 'production-step-report.reverse', reversalId, {
        batchId,
        stepRecordId,
        reversalOfReportId: reportId,
        reason: payload.reason,
      });
      return commandResult(connection, batchId, stepRecordId, required, released, reversalId, null);
    });
  }

  correctReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: CorrectBatchStepReportPayload,
    context: CommandContext,
  ): Promise<CorrectBatchStepReportCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      const { current, required, released, downstream } = await lockContext(
        connection,
        batchId,
        stepRecordId,
      );
      assertVersion(current, payload.version);
      requireReportQuantities(payload.normalQuantity, payload.abnormalQuantity);
      const target = await lockReport(connection, batchId, stepRecordId, reportId);
      requireCorrectable(target);
      const correctedNormal = add(
        subtract(current.effective_normal, target.normal_quantity),
        payload.normalQuantity,
      );
      const correctedReported = add(
        subtract(current.effective_direct_reported, target.reported_quantity),
        add(payload.normalQuantity, payload.abnormalQuantity),
      );
      requireReportWithinReleased(correctedReported, 0, 0, released);
      requireNoDownstreamQuantityConflict(
        correctedNormal,
        downstream?.effective_direct_reported ?? 0,
      );
      const reversalId = await insertReport(connection, {
        batchId,
        stepRecordId,
        reportType: 'reversal',
        normalQuantity: Number(target.normal_quantity),
        abnormalQuantity: Number(target.abnormal_quantity),
        unit: target.unit_snapshot,
        remark: payload.reason,
        actorId,
        reversalOfReportId: reportId,
      });
      const replacementId = await insertReport(connection, {
        batchId,
        stepRecordId,
        reportType: 'normal',
        normalQuantity: payload.normalQuantity,
        abnormalQuantity: payload.abnormalQuantity,
        unit: target.unit_snapshot,
        remark: payload.reason,
        actorId,
        replacesReportId: reportId,
      });
      const dispositionId =
        payload.abnormalQuantity > 0
          ? await insertDisposition(connection, batchId, stepRecordId, replacementId, actorId)
          : null;
      await updateStepAfterFacts(connection, current, correctedNormal, required, actorId);
      await audit(connection, context, 'production-step-report.correct', replacementId, {
        batchId,
        stepRecordId,
        correctionOfReportId: reportId,
        reversalReportId: reversalId,
        reason: payload.reason,
      });
      const summary = await summaryResult(connection, batchId, stepRecordId, required, released);
      return {
        ...summary,
        reversal: mapReport(await selectReport(connection, String(reversalId))),
        replacement: mapReport(await selectReport(connection, String(replacementId))),
        abnormalDisposition: dispositionId
          ? mapDisposition(await selectDisposition(connection, String(dispositionId)))
          : null,
      };
    });
  }
}

const lockContext = async (connection: PoolConnection, batchId: string, stepRecordId: string) => {
  const batch = await findBatch(connection, batchId, true);
  if (batch.status !== 'doing')
    throw new ProductionDomainError('STEP_REPORT_NOT_ALLOWED', '生产批次不在执行中');
  await connection.query(
    'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
    [batchId],
  );
  const [steps] = await connection.query<LockedStepRow[]>(LOCKED_STEP_SELECT, [batchId]);
  const index = steps.findIndex((row) => String(row.id) === stepRecordId);
  if (index < 0) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
  const current = steps[index]!;
  const supplements =
    (await selectRouteSupplementSources(connection, [batchId])).get(batchId) ?? [];
  const quantity = calculateRouteStepQuantities(
    batch.planned_quantity,
    steps.map(toRouteQuantityStep),
    supplements,
  ).get(stepRecordId)!;
  const required = quantity.requiredNormalQuantity;
  const released = quantity.releasedInputQuantity;
  return { batch, steps, current, index, required, released, downstream: steps[index + 1] ?? null };
};

const requireCorrectable = (target: ReportRow): void => {
  if (target.report_type !== 'normal' || !target.is_effective)
    throw new ProductionDomainError('STEP_REPORT_ALREADY_REVERSED', '原报工已经冲销或不可更正');
};

const lockReport = async (
  connection: PoolConnection,
  batchId: string,
  stepRecordId: string,
  reportId: string,
): Promise<ReportRow> => {
  const [rows] = await connection.query<ReportRow[]>(`${REPORT_SELECT} AND r.id=? FOR UPDATE`, [
    batchId,
    stepRecordId,
    reportId,
  ]);
  const row = rows[0];
  if (!row) throw new ProductionDomainError('NOT_FOUND', '报工事实不存在');
  const [dependencies] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM batch_step_abnormal_dispositions WHERE batch_step_report_id=?
     UNION ALL SELECT id FROM batch_step_reports WHERE replaces_report_id=?
     UNION ALL SELECT id FROM rework_records WHERE completed_report_id=? LIMIT 1`,
    [reportId, reportId, reportId],
  );
  if (dependencies.length > 0)
    throw new ProductionDomainError(
      'STEP_REPORT_DEPENDENCY_CONFLICT',
      '该报工已有异常处置或更正依赖，不能再次冲销或更正',
    );
  return row;
};

const insertReport = async (
  connection: PoolConnection,
  input: {
    batchId: string;
    stepRecordId: string;
    reportType: 'normal' | 'reversal';
    normalQuantity: number;
    abnormalQuantity: number;
    unit: string;
    remark: string | null;
    actorId: string;
    reversalOfReportId?: string;
    replacesReportId?: string;
  },
): Promise<string> => {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO batch_step_reports
     (report_no,production_batch_id,batch_step_record_id,report_type,reversal_of_report_id,replaces_report_id,reported_quantity,normal_quantity,abnormal_quantity,unit_snapshot,remark,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      `SR-${Date.now()}-${randomUUID().slice(0, 12)}`,
      input.batchId,
      input.stepRecordId,
      input.reportType,
      input.reversalOfReportId ?? null,
      input.replacesReportId ?? null,
      fixed(input.normalQuantity + input.abnormalQuantity),
      fixed(input.normalQuantity),
      fixed(input.abnormalQuantity),
      input.unit,
      input.remark,
      input.actorId,
    ],
  );
  return String(result.insertId);
};

const insertDisposition = async (
  connection: PoolConnection,
  batchId: string,
  stepRecordId: string,
  reportId: string,
  actorId: string,
): Promise<string> => {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO batch_step_abnormal_dispositions
     (disposition_no,production_batch_id,batch_step_record_id,batch_step_report_id,review_status,created_by,updated_by)
     VALUES (?,?,?,?,'pending_review',?,?)`,
    [
      `BAD-${Date.now()}-${randomUUID().slice(0, 12)}`,
      batchId,
      stepRecordId,
      reportId,
      actorId,
      actorId,
    ],
  );
  return String(result.insertId);
};

const updateStepAfterFacts = async (
  connection: PoolConnection,
  step: LockedStepRow,
  effectiveNormal: string,
  required: string,
  actorId: string,
): Promise<void> => {
  const completed = isRequiredNormalCompleted(effectiveNormal, required);
  await connection.execute(
    `UPDATE batch_step_records SET status=?,completed_at=${completed ? 'COALESCE(completed_at,NOW())' : 'NULL'},version=version+1,updated_by=? WHERE id=?`,
    [completed ? 'completed' : 'doing', actorId, step.id],
  );
};

const commandResult = async (
  connection: PoolConnection,
  batchId: string,
  stepRecordId: string,
  required: string,
  released: string,
  reportId: string,
  dispositionId: string | null,
): Promise<BatchStepReportCommandResult> => ({
  ...(await summaryResult(connection, batchId, stepRecordId, required, released)),
  report: mapReport(await selectReport(connection, reportId)),
  abnormalDisposition: dispositionId
    ? mapDisposition(await selectDisposition(connection, dispositionId))
    : null,
});

const summaryResult = async (
  connection: PoolConnection,
  batchId: string,
  stepRecordId: string,
  required: string,
  released: string,
) => {
  const [rows] = await connection.query<LockedStepRow[]>(
    `SELECT sr.id,sr.step_order_snapshot,sr.status,sr.responsible_user_id,sr.need_record_snapshot,sr.unit_snapshot,sr.version,${SUMMARY_COLUMNS}
     FROM batch_step_records sr LEFT JOIN batch_step_reports r ON r.batch_step_record_id=sr.id
     WHERE sr.production_batch_id=? AND sr.id=? GROUP BY sr.id`,
    [batchId, stepRecordId],
  );
  const row = rows[0]!;
  return {
    productionBatchId: batchId,
    stepRecordId,
    stepStatus: row.status,
    stepVersion: row.version,
    requiredNormalQuantity: fixed(required),
    releasedNormalQuantity: fixed(released),
    availableNormalQuantity: fixed(
      Math.max(0, Number(released) - Number(row.effective_direct_reported)),
    ),
    effectiveReportedQuantity: row.effective_reported,
    effectiveNormalQuantity: row.effective_normal,
    effectiveAbnormalQuantity: row.effective_abnormal,
    remainingNormalQuantity: fixed(Math.max(0, Number(required) - Number(row.effective_normal))),
  };
};

const selectReport = async (connection: PoolConnection, reportId: string): Promise<ReportRow> => {
  const [rows] = await connection.query<ReportRow[]>(`${REPORT_SELECT_BY_ID}`, [reportId]);
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '报工事实不存在');
  return rows[0];
};
const selectDisposition = async (
  connection: PoolConnection,
  dispositionId: string,
): Promise<DispositionRow> => {
  const [rows] = await connection.query<DispositionRow[]>(`${DISPOSITION_SELECT} WHERE d.id=?`, [
    dispositionId,
  ]);
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '异常处置单不存在');
  return rows[0];
};
const findReversal = async (
  connection: PoolConnection,
  reportId: string,
): Promise<ReportRow | undefined> => {
  const [rows] = await connection.query<ReportRow[]>(`${REPORT_SELECT_BY_REVERSAL}`, [reportId]);
  return rows[0];
};

const requireActor = (context: CommandContext): string => {
  if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
  return context.actorId;
};
const assertVersion = (step: LockedStepRow, version: number): void => {
  if (step.version !== version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '工序状态已变化，请刷新后重试');
};
const SUMMARY_COLUMNS = `COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.reported_quantity ELSE -r.reported_quantity END),0) effective_reported,
  COALESCE(SUM(CASE WHEN NOT EXISTS (
    SELECT 1 FROM rework_records direct_rework WHERE direct_rework.completed_report_id=r.id
  ) THEN CASE WHEN r.report_type='normal' THEN r.reported_quantity ELSE -r.reported_quantity END ELSE 0 END),0) effective_direct_reported,
  COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END),0) effective_normal,
  COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.abnormal_quantity ELSE -r.abnormal_quantity END),0) effective_abnormal`;
const LOCKED_STEP_SELECT = `SELECT sr.id,sr.step_order_snapshot,sr.status,sr.responsible_user_id,sr.need_record_snapshot,sr.unit_snapshot,sr.version,${SUMMARY_COLUMNS}
  FROM batch_step_records sr LEFT JOIN batch_step_reports r ON r.batch_step_record_id=sr.id
  WHERE sr.production_batch_id=? GROUP BY sr.id ORDER BY sr.step_order_snapshot,sr.id`;
const PROJECTION_STEP_SELECT = `SELECT sr.id,sr.production_batch_id,sr.step_order_snapshot,sr.step_code_snapshot,sr.step_name_snapshot,sr.status,sr.responsible_user_id,sr.need_record_snapshot,sr.unit_snapshot,sr.started_at,sr.completed_at,sr.version,${SUMMARY_COLUMNS}
  FROM batch_step_records sr LEFT JOIN batch_step_reports r ON r.batch_step_record_id=sr.id
  WHERE sr.production_batch_id=? GROUP BY sr.id ORDER BY sr.step_order_snapshot,sr.id`;
const REPORT_FIELDS = `r.id,r.report_no,r.production_batch_id,r.batch_step_record_id,r.report_type,r.reversal_of_report_id,r.replaces_report_id,r.reported_quantity,r.normal_quantity,r.abnormal_quantity,r.unit_snapshot,r.remark,r.created_by,r.created_at,
  CASE WHEN r.report_type='reversal' THEN 1 WHEN NOT EXISTS (SELECT 1 FROM batch_step_reports reversal WHERE reversal.reversal_of_report_id=r.id) THEN 1 ELSE 0 END is_effective`;
const REPORT_SELECT = `SELECT ${REPORT_FIELDS} FROM batch_step_reports r WHERE r.production_batch_id=? AND r.batch_step_record_id=?`;
const REPORT_SELECT_BY_ID = `SELECT ${REPORT_FIELDS} FROM batch_step_reports r WHERE r.id=?`;
const REPORT_SELECT_BY_REVERSAL = `SELECT ${REPORT_FIELDS} FROM batch_step_reports r WHERE r.reversal_of_report_id=?`;
const REPORT_SELECT_BATCH = `SELECT ${REPORT_FIELDS} FROM batch_step_reports r WHERE r.production_batch_id=? ORDER BY r.created_at,r.id`;
const DISPOSITION_SELECT = `SELECT d.id,d.disposition_no,d.production_batch_id,d.batch_step_record_id,d.batch_step_report_id,d.review_status,d.disposition_type,d.remark,d.version,d.created_at FROM batch_step_abnormal_dispositions d`;
const DISPOSITION_SELECT_BATCH = `${DISPOSITION_SELECT} WHERE d.production_batch_id=? ORDER BY d.created_at,d.id`;

const audit = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  reportId: string,
  afterData: unknown,
): Promise<void> =>
  writeTransactionalAudit(connection, {
    logType: 'business',
    module: 'production',
    action,
    userId: context.actorId,
    targetId: reportId,
    targetType: 'batch_step_report',
    result: 'success',
    beforeData: null,
    afterData,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });

const toRouteQuantityStep = (step: LockedStepRow | ProjectionStepRow): RouteQuantityStep => ({
  id: step.id,
  stepOrder: step.step_order_snapshot,
  needRecord: Boolean(step.need_record_snapshot),
  status: step.status,
  effectiveDirectReported: step.effective_direct_reported,
  effectiveNormal: step.effective_normal,
});
