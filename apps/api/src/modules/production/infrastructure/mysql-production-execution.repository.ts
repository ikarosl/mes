import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepStatus,
  ProductionExecutionCompletionCheck,
  ProductionExecutionCompletionResult,
  ProductionStepCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionExecutionRepository } from '../application/ports/production-execution.repository.js';
import {
  requireAssignableStep,
  requireAssignedStep,
  requireFirstStepStartable,
  requireFollowingStepStartable,
} from '../domain/production-execution.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { evaluateProductionExecutionCompletion } from '../domain/production-completion.policy.js';
import { findBatch } from './mysql-production.shared.js';
import type { BatchRow, Db } from './mysql-production.shared.js';
import { selectWorkerTasks } from './mysql-production-worker-task.projection.js';

type ExecutionStepRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  step_order_snapshot: number;
  status: BatchStepStatus;
  responsible_user_id: number | null;
  need_record_snapshot: number;
  effective_normal: string;
  started_at: Date | null;
  version: number;
};
type CompletionStepRow = RowDataPacket & {
  id: number;
  step_order_snapshot: number;
  step_name_snapshot: string;
  status: BatchStepStatus;
  effective_normal: string;
};
@Injectable()
export class MysqlProductionExecutionRepository extends ProductionExecutionRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }
  async getCompletionCheck(batchId: string): Promise<ProductionExecutionCompletionCheck> {
    const batch = await findBatch(this.pool, batchId);
    const steps = await selectRequiredCompletionSteps(this.pool, batchId);
    return mapCompletionCheck(batchId, batch, steps);
  }
  async completeExecution(
    batchId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionExecutionCompletionResult> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = context.actorId;
      if (!actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      const batch = await findBatch(connection, batchId, true);
      if (batch.status === 'completed') return completionResult(batchId, batch);
      if (batch.status !== 'doing')
        throw new ProductionDomainError(
          'BATCH_EXECUTION_COMPLETION_NOT_ALLOWED',
          '只有生产执行中的批次可以确认完工',
        );
      if (batch.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产批次状态已变化，请刷新后重试',
        );
      await connection.query(
        'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
        [batchId],
      );
      const steps = await selectRequiredCompletionSteps(connection, batchId);
      const check = mapCompletionCheck(batchId, batch, steps);
      if (!check.canComplete) throwCompletionBlocker(check);
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE production_batches
         SET completed_quantity=?,status='completed',completed_at=NOW(),completed_by=?,updated_by=?,version=version+1
         WHERE id=? AND status='doing' AND version=?`,
        [check.finalEffectiveNormalQuantity, actorId, actorId, batchId, version],
      );
      assertVersion(updated, '生产批次状态已变化，请刷新后重试');
      await writeTransactionalAudit(connection, {
        logType: 'business',
        module: 'production',
        action: 'production-execution.complete',
        userId: actorId,
        targetId: batchId,
        targetType: 'production_batch',
        result: 'success',
        beforeData: { status: batch.status, version: batch.version },
        afterData: {
          status: 'completed',
          completedQuantity: check.finalEffectiveNormalQuantity,
          version: version + 1,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return completionResult(batchId, await findBatch(connection, batchId));
    });
  }
  async listWorkerTasks(actorId: string) {
    return selectWorkerTasks(this.pool, actorId);
  }

  assignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionStepCommandResult> {
    return this.changeAssignment(
      'assign',
      batchId,
      stepRecordId,
      responsibleUserId,
      version,
      context,
    );
  }

  unassignStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionStepCommandResult> {
    return this.changeAssignment('unassign', batchId, stepRecordId, null, version, context);
  }

  reassignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionStepCommandResult> {
    return this.changeAssignment(
      'reassign',
      batchId,
      stepRecordId,
      responsibleUserId,
      version,
      context,
    );
  }

  async startStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext & { actorId: string },
  ): Promise<ProductionStepCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      const steps = await lockExecutionSteps(connection, batchId);
      const index = steps.findIndex((step) => String(step.id) === stepRecordId);
      if (index < 0) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
      const current = steps[index]!;
      if (String(current.responsible_user_id) !== context.actorId)
        throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '只有当前派工员工可以开始该工序');
      if (
        (current.status === 'doing' || current.status === 'completed') &&
        current.started_at !== null
      )
        return this.commandResult(connection, batchId, stepRecordId);
      if (current.status !== 'assigned')
        throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '当前工序状态不允许开工');

      if (index === 0) {
        requireFirstStepStartable(batch.status);
      } else {
        const previous = steps[index - 1]!;
        requireFollowingStepStartable({
          batchStatus: batch.status,
          previousNeedRecord: Boolean(previous.need_record_snapshot),
          previousStatus: previous.status,
          previousEffectiveNormal: Number(previous.effective_normal),
        });
      }
      const [updated] = await connection.execute<ResultSetHeader>(
        "UPDATE batch_step_records SET status='doing',started_at=NOW(),version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND status='assigned' AND version=?",
        [context.actorId, stepRecordId, batchId, version],
      );
      assertVersion(updated, '工序派工状态已变化，请刷新任务后重试');
      if (index === 0) {
        const [batchUpdated] = await connection.execute<ResultSetHeader>(
          "UPDATE production_batches SET status='doing',started_at=COALESCE(started_at,NOW()),version=version+1,updated_by=? WHERE id=? AND status='material_outbound'",
          [context.actorId, batchId],
        );
        if (batchUpdated.affectedRows !== 1)
          throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '生产批次开工状态已变化');
      }
      await auditStep(connection, context, 'production-step.start', stepRecordId, {
        status: 'assigned',
        responsibleUserId: context.actorId,
        version,
      });
      return this.commandResult(connection, batchId, stepRecordId);
    });
  }

  private async changeAssignment(
    action: 'assign' | 'unassign' | 'reassign',
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string | null,
    version: number,
    context: CommandContext,
  ): Promise<ProductionStepCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      if (batch.status === 'cancelled' || batch.status === 'completed')
        throw new ProductionDomainError(
          'STEP_ASSIGNMENT_CONFLICT',
          '已取消或已完成批次不能调整派工',
        );
      const current = await lockExecutionStep(connection, batchId, stepRecordId);

      if (action === 'assign') {
        if (
          current.status === 'assigned' &&
          String(current.responsible_user_id) === responsibleUserId
        )
          return this.commandResult(connection, batchId, stepRecordId);
        requireAssignableStep(current.status);
      } else if (action === 'unassign') {
        if (current.status === 'pending' && current.responsible_user_id === null)
          return this.commandResult(connection, batchId, stepRecordId);
        requireAssignedStep(current.status);
      } else {
        if (
          current.status === 'assigned' &&
          String(current.responsible_user_id) === responsibleUserId
        )
          return this.commandResult(connection, batchId, stepRecordId);
        requireAssignedStep(current.status);
      }

      const targetStatus = action === 'unassign' ? 'pending' : 'assigned';
      const [updated] = await connection.execute<ResultSetHeader>(
        'UPDATE batch_step_records SET status=?,responsible_user_id=?,version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND version=?',
        [targetStatus, responsibleUserId, context.actorId, stepRecordId, batchId, version],
      );
      assertVersion(updated, '工序派工已被其他操作修改，请刷新后重试');
      await auditStep(connection, context, `production-step.${action}`, stepRecordId, {
        status: targetStatus,
        responsibleUserId,
        version: version + 1,
      });
      return this.commandResult(connection, batchId, stepRecordId);
    });
  }

  private async commandResult(
    connection: PoolConnection,
    batchId: string,
    stepRecordId: string,
  ): Promise<ProductionStepCommandResult> {
    const batch = await findBatch(connection, batchId);
    const step = await lockExecutionStep(connection, batchId, stepRecordId, false);
    return {
      productionBatchId: batchId,
      batchStatus: batch.status,
      batchVersion: batch.version,
      stepRecordId,
      stepStatus: step.status,
      responsibleUserId:
        step.responsible_user_id === null ? null : String(step.responsible_user_id),
      startedAt: step.started_at ? toBeijingISOString(step.started_at) : null,
      version: step.version,
    };
  }
}

const lockExecutionSteps = async (
  connection: PoolConnection,
  batchId: string,
): Promise<ExecutionStepRow[]> => {
  await connection.query(
    'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
    [batchId],
  );
  const [rows] = await connection.query<ExecutionStepRow[]>(
    `SELECT sr.id,sr.production_batch_id,sr.step_order_snapshot,sr.status,sr.responsible_user_id,
     sr.need_record_snapshot,sr.started_at,sr.version,
     COALESCE((SELECT SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END) FROM batch_step_reports r WHERE r.batch_step_record_id=sr.id),0) effective_normal
     FROM batch_step_records sr WHERE sr.production_batch_id=? ORDER BY sr.step_order_snapshot,sr.id`,
    [batchId],
  );
  return rows;
};

const lockExecutionStep = async (
  connection: PoolConnection,
  batchId: string,
  stepRecordId: string,
  lock = true,
): Promise<ExecutionStepRow> => {
  const [rows] = await connection.query<ExecutionStepRow[]>(
    `SELECT sr.id,sr.production_batch_id,sr.step_order_snapshot,sr.status,sr.responsible_user_id,
     sr.need_record_snapshot,sr.started_at,sr.version,
     COALESCE((SELECT SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END) FROM batch_step_reports r WHERE r.batch_step_record_id=sr.id),0) effective_normal
     FROM batch_step_records sr WHERE sr.id=? AND sr.production_batch_id=?${lock ? ' FOR UPDATE' : ''}`,
    [stepRecordId, batchId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
  return rows[0];
};

const assertVersion = (result: ResultSetHeader, message: string): void => {
  if (result.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', message);
};

const auditStep = (
  connection: PoolConnection,
  context: CommandContext,
  action: string,
  stepRecordId: string,
  afterData: unknown,
): Promise<void> =>
  writeTransactionalAudit(connection, {
    logType: 'business',
    module: 'production',
    action,
    userId: context.actorId,
    targetId: stepRecordId,
    targetType: 'batch_step_record',
    result: 'success',
    beforeData: null,
    afterData,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  });

const selectRequiredCompletionSteps = async (
  db: Db,
  batchId: string,
): Promise<CompletionStepRow[]> => {
  const [rows] = await db.query<CompletionStepRow[]>(
    `SELECT sr.id,sr.step_order_snapshot,sr.step_name_snapshot,sr.status,
      COALESCE(SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END),0) effective_normal
     FROM batch_step_records sr
     LEFT JOIN batch_step_reports r ON r.batch_step_record_id=sr.id
     WHERE sr.production_batch_id=? AND sr.need_record_snapshot=1
     GROUP BY sr.id,sr.step_order_snapshot,sr.step_name_snapshot,sr.status
     ORDER BY sr.step_order_snapshot,sr.id`,
    [batchId],
  );
  return rows;
};

const mapCompletionCheck = (
  batchId: string,
  batch: BatchRow,
  steps: CompletionStepRow[],
): ProductionExecutionCompletionCheck =>
  evaluateProductionExecutionCompletion({
    productionBatchId: batchId,
    batchStatus: batch.status,
    version: batch.version,
    plannedQuantity: batch.planned_quantity,
    requiredSteps: steps.map((step) => ({
      id: String(step.id),
      order: step.step_order_snapshot,
      name: step.step_name_snapshot,
      status: step.status,
      effectiveNormalQuantity: step.effective_normal,
    })),
  });

const throwCompletionBlocker = (check: ProductionExecutionCompletionCheck): never => {
  const blocker = check.blockers[0];
  if (blocker === 'no_required_reporting_step')
    throw new ProductionDomainError(
      'NO_REQUIRED_REPORTING_STEP',
      '批次没有必报工工序，不能执行完工',
    );
  if (blocker === 'required_step_incomplete')
    throw new ProductionDomainError('REQUIRED_STEP_INCOMPLETE', '仍有必报工工序尚未完成');
  if (blocker === 'final_step_quantity_insufficient')
    throw new ProductionDomainError(
      'FINAL_STEP_QUANTITY_INSUFFICIENT',
      '末道必报工工序的有效正常数量未达到批次计划数量',
    );
  throw new ProductionDomainError(
    'BATCH_EXECUTION_COMPLETION_NOT_ALLOWED',
    '只有生产执行中的批次可以确认完工',
  );
};

const completionResult = (
  batchId: string,
  batch: BatchRow,
): ProductionExecutionCompletionResult => {
  if (batch.status !== 'completed' || !batch.completed_at || batch.completed_by === null)
    throw new ProductionDomainError('CONFLICT', '生产批次完工结果不完整');
  return {
    productionBatchId: batchId,
    batchStatus: 'completed',
    completedQuantity: batch.completed_quantity,
    completedAt: toBeijingISOString(batch.completed_at),
    completedById: String(batch.completed_by),
    version: batch.version,
  };
};
