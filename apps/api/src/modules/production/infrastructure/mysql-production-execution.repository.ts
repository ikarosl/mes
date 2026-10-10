import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepStatus,
  ProductionExecutionCompletionCheck,
  ProductionExecutionCompletionResult,
  ProductionStepCommandResult,
  ProductionCloseoutMode,
  WorkOrderStatus,
  ResearchExecutionStartResult,
  ReopenProductionStepPayload,
  PageResult,
  ProductionStepExecutionHistoryItem,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionExecutionRepository } from '../application/ports/production-execution.repository.js';
import {
  requireAssignableStep,
  requireAssignedStep,
  requireFirstStepStartable,
  requireFollowingStepStartable,
  requireReassignableStep,
} from '../domain/production-execution.policy.js';
import {
  appendStepExecutionAction,
  lockExecutionSteps,
  lockExecutionStep,
  auditStep,
  stepAuditState,
  mapStepCommandResult,
  requireUnfrozenStepActions,
  selectStepExecutionHistory,
  hasStepReportHistory,
} from './mysql-production-step-actions.persistence.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { evaluateProductionExecutionCompletion } from '../domain/production-completion.policy.js';
import {
  requireBatchTransition,
  requireWorkOrderTransition,
} from '../domain/production-status.policy.js';
import { findBatch } from './mysql-production.shared.js';
import type { BatchRow, Db } from './mysql-production.shared.js';
import { selectWorkerTasks } from './mysql-production-worker-task.projection.js';
import { selectProductionStepSopSnapshot } from './mysql-production-step-sop.projection.js';
import {
  evaluateShortBatchStart,
  getConfirmedMaterialOutboundQuantity,
} from './mysql-production-short-batch.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import { executeStepStateCommand } from './mysql-production-step-state.commands.js';

type CompletionStepRow = RowDataPacket & {
  id: number;
  step_order_snapshot: number;
  step_name_snapshot: string;
  status: BatchStepStatus;
  effective_normal: string;
};
@Injectable()
export class MysqlProductionExecutionRepository extends ProductionExecutionRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly identity: IdentityDirectoryService,
  ) {
    super();
  }
  async startResearchExecution(
    batchId: string,
    version: number,
    context: CommandContext,
  ): Promise<ResearchExecutionStartResult> {
    return withTransaction(this.pool, async (connection) => {
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      const policy = await lockWorkOrderForBatch(connection, batchId);
      if (policy.orderType !== 'research')
        throw new ProductionDomainError('INVALID_STATE', '该开始入口仅适用于研发任务');
      const batch = await findBatch(connection, batchId, true);
      if (batch.version !== version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '任务已变化，请刷新后重试');
      const [[order]] = await connection.query<(RowDataPacket & { status: WorkOrderStatus })[]>(
        'SELECT status FROM work_orders WHERE id=? FOR UPDATE',
        [policy.workOrderId],
      );
      if (!order || !['released', 'doing'].includes(order.status))
        throw new ProductionDomainError('INVALID_STATE', '当前工单状态不允许开始研发');
      const shortStart =
        batch.status === 'material_partially_outbound'
          ? await evaluateShortBatchStart(connection, batchId, batch.material_plan_version, true)
          : null;
      if (batch.status !== 'material_outbound' && !shortStart?.canStart)
        throw new ProductionDomainError(
          'INVALID_STATE',
          shortStart?.blockedReason ?? '研发须完成领料，或取得当前物料计划的有效短批授权后开始',
        );
      if (
        batch.status === 'material_outbound' &&
        (await getConfirmedMaterialOutboundQuantity(connection, batchId, true)) <= 0
      )
        throw new ProductionDomainError('INVALID_STATE', '研发开工前必须已发生确认领料');
      if (
        batch.status === 'material_outbound' &&
        (await countActiveMaterialDemands(connection, batchId, true)) > 0
      )
        throw new ProductionDomainError(
          'INVALID_STATE',
          '新增需求尚未领齐，请完成本任务需求后开始研发',
        );
      requireBatchTransition(batch.status, 'doing');
      const [changed] = await connection.execute<ResultSetHeader>(
        `UPDATE production_batches SET status='doing',started_at=NOW(),version=version+1,updated_by=?
         WHERE id=? AND version=? AND status IN ('material_outbound','material_partially_outbound')`,
        [context.actorId, batchId, version],
      );
      assertVersion(changed, '研发任务已变化，请刷新后重试');
      if (order.status === 'released') {
        requireWorkOrderTransition(order.status, 'doing');
        await connection.execute(
          "UPDATE work_orders SET status='doing',version=version+1,updated_by=? WHERE id=? AND status='released'",
          [context.actorId, policy.workOrderId],
        );
      }
      if (shortStart) {
        const [consumed] = await connection.execute<ResultSetHeader>(
          `UPDATE production_short_batch_authorization SET status='consumed',used_at=NOW(),version=version+1
           WHERE production_batch_id=? AND material_plan_version=? AND status='active'`,
          [batchId, batch.material_plan_version],
        );
        assertVersion(consumed, '短批授权已变化，请刷新后重试');
      }
      const after = await findBatch(connection, batchId, true);
      if (!after.started_at) throw new ProductionDomainError('CONFLICT', '研发开始时间未记录');
      const result: ResearchExecutionStartResult = {
        productionBatchId: batchId,
        batchStatus: 'doing',
        startedAt: toBeijingISOString(after.started_at),
        version: after.version,
      };
      await writeTransactionalAudit(connection, {
        logType: 'business',
        module: 'production',
        action: 'production-research.start',
        userId: context.actorId,
        targetId: batchId,
        targetType: 'production_batch',
        result: 'success',
        beforeData: { status: batch.status, version },
        afterData: result,
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return result;
    });
  }

  completeResearchExecution(batchId: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (connection) => {
      const policy = await lockWorkOrderForBatch(connection, batchId);
      if (policy.orderType !== 'research')
        throw new ProductionDomainError('INVALID_STATE', '该结束入口仅适用于研发任务');
      return this.completeExecution(batchId, version, context);
    });
  }
  async getCompletionCheck(batchId: string): Promise<ProductionExecutionCompletionCheck> {
    const batch = await findBatch(this.pool, batchId);
    const steps = await selectRequiredCompletionSteps(this.pool, batchId);
    return mapCompletionCheck(
      batchId,
      batch,
      steps,
      await countActiveMaterialDemands(this.pool, batchId),
      await countUnfulfilledSupplements(this.pool, batchId),
    );
  }
  async completeExecution(
    batchId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionExecutionCompletionResult> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = context.actorId;
      if (!actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      await lockWorkOrderForBatch(connection, batchId);
      const batch = await findBatch(connection, batchId, true);
      const [[closeout]] = await connection.query<
        (RowDataPacket & { id: number; closeout_mode: ProductionCloseoutMode })[]
      >(
        'SELECT id,closeout_mode FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE',
        [batchId],
      );
      if (
        closeout?.closeout_mode === 'normal' &&
        (batch.status === 'closing' || batch.status === 'completed')
      ) {
        const steps = await selectRequiredCompletionSteps(connection, batchId, true);
        return completionResult(
          batchId,
          batch,
          String(closeout.id),
          String(steps.at(-1)?.effective_normal ?? 0),
        );
      }
      if (batch.status !== 'doing')
        throw new ProductionDomainError(
          'BATCH_EXECUTION_COMPLETION_NOT_ALLOWED',
          '只有执行中的任务可以确认本轮执行结束',
        );
      requireBatchTransition(batch.status, 'closing');
      if (closeout) throw new ProductionDomainError('CONFLICT', '生产任务已有结案记录，请刷新核对');
      if (batch.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产批次状态已变化，请刷新后重试',
        );
      await connection.query(
        'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
        [batchId],
      );
      await connection.query(
        'SELECT id FROM production_item_demand WHERE production_batch_id=? ORDER BY id FOR UPDATE',
        [batchId],
      );
      const steps = await selectRequiredCompletionSteps(connection, batchId, true);
      const check = mapCompletionCheck(
        batchId,
        batch,
        steps,
        await countActiveMaterialDemands(connection, batchId, true),
        await countUnfulfilledSupplements(connection, batchId),
      );
      if (!check.canComplete) throwCompletionBlocker(check);
      const [created] = await connection.execute<ResultSetHeader>(
        `INSERT INTO production_batch_closeout
         (production_batch_id,closeout_mode,reason,created_by,updated_by) VALUES (?,'normal',?,?,?)`,
        [
          batchId,
          batch.order_type === 'research'
            ? '本轮研发结束，核对物料和产出后结案'
            : '工序执行完成，核对产出后结案',
          actorId,
          actorId,
        ],
      );
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE production_batches
         SET status='closing',execution_completed_at=NOW(),execution_completed_by=?,updated_by=?,version=version+1
         WHERE id=? AND status='doing' AND version=?`,
        [actorId, actorId, batchId, version],
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
          status: 'closing',
          closeoutId: String(created.insertId),
          closeoutMode: 'normal',
          lastStepReportedQuantity: check.finalEffectiveNormalQuantity,
          version: version + 1,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return completionResult(
        batchId,
        await findBatch(connection, batchId, true),
        String(created.insertId),
        check.finalEffectiveNormalQuantity,
      );
    });
  }
  async listWorkerTasks(actorId: string, query: { page: number; pageSize: number }) {
    return selectWorkerTasks(this.pool, actorId, query);
  }

  async getStepSopSnapshot(batchId: string, stepRecordId: string, responsibleUserId?: string) {
    return selectProductionStepSopSnapshot(this.pool, batchId, stepRecordId, responsibleUserId);
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
    asAdministrator = false,
  ): Promise<ProductionStepCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      await lockWorkOrderForBatch(connection, batchId);
      const batch = await findBatch(connection, batchId, true);
      await requireUnfrozenStepActions(connection, batchId);
      if (!['material_outbound', 'material_partially_outbound', 'doing'].includes(batch.status))
        throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '本轮已结束，不能继续开工');
      const steps = await lockExecutionSteps(connection, batchId);
      const index = steps.findIndex((step) => String(step.id) === stepRecordId);
      if (index < 0) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
      const current = steps[index]!;
      if (!asAdministrator && String(current.responsible_user_id) !== context.actorId)
        throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '只有当前派工员工可以开始该工序');
      if (current.responsible_user_id === null)
        throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '工序尚未派工，不能开始');
      if (
        (current.status === 'doing' || current.status === 'completed') &&
        current.started_at !== null
      )
        return this.commandResult(connection, batchId, stepRecordId);
      if (current.status !== 'assigned')
        throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '当前工序状态不允许开工');

      const startsTask = index === 0 && batch.status !== 'doing';
      if (startsTask) {
        const shortBatchStart =
          batch.status === 'material_partially_outbound'
            ? await evaluateShortBatchStart(connection, batchId, batch.material_plan_version, true)
            : null;
        if (shortBatchStart && !shortBatchStart.canStart)
          throw new ProductionDomainError(
            'STEP_START_NOT_ALLOWED',
            shortBatchStart.blockedReason ?? '当前短批授权不允许开工',
          );
        requireFirstStepStartable(batch.status, shortBatchStart?.canStart ?? false);
        requireBatchTransition(batch.status, 'doing');
      } else {
        requireFollowingStepStartable({ batchStatus: batch.status });
      }
      const [updated] = await connection.execute<ResultSetHeader>(
        "UPDATE batch_step_records SET status='doing',started_at=NOW(),version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND status='assigned' AND version=?",
        [context.actorId, stepRecordId, batchId, version],
      );
      assertVersion(updated, '工序派工状态已变化，请刷新任务后重试');
      if (startsTask) {
        const [batchUpdated] = await connection.execute<ResultSetHeader>(
          "UPDATE production_batches SET status='doing',started_at=COALESCE(started_at,NOW()),version=version+1,updated_by=? WHERE id=? AND status IN ('material_outbound','material_partially_outbound')",
          [context.actorId, batchId],
        );
        if (batchUpdated.affectedRows !== 1)
          throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '生产批次开工状态已变化');
        const [[workOrder]] = await connection.query<
          (RowDataPacket & { status: WorkOrderStatus })[]
        >('SELECT status FROM work_orders WHERE id=? FOR UPDATE', [String(batch.work_order_id)]);
        if (!workOrder || (workOrder.status !== 'released' && workOrder.status !== 'doing'))
          throw new ProductionDomainError(
            'STEP_START_NOT_ALLOWED',
            '生产工单当前状态不允许批次开工',
          );
        if (workOrder.status === 'released') {
          requireWorkOrderTransition(workOrder.status, 'doing');
          const [workOrderUpdated] = await connection.execute<ResultSetHeader>(
            "UPDATE work_orders SET status='doing',version=version+1,updated_by=? WHERE id=? AND status='released'",
            [context.actorId, String(batch.work_order_id)],
          );
          if (workOrderUpdated.affectedRows !== 1)
            throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '生产工单开工状态已变化');
        }
        if (batch.status === 'material_partially_outbound')
          await connection.execute(
            `UPDATE production_short_batch_authorization
             SET status='consumed',used_at=NOW(),version=version+1
             WHERE production_batch_id=? AND material_plan_version=? AND status='active'`,
            [batchId, batch.material_plan_version],
          );
      }
      const after = await lockExecutionStep(connection, batchId, stepRecordId, false);
      await appendStepExecutionAction(connection, {
        batchId,
        stepRecordId,
        actionType: 'start',
        actorId: context.actorId,
        before: current,
        after,
      });
      await auditStep(
        connection,
        context,
        'production-step.start',
        stepRecordId,
        {
          status: 'doing',
          responsibleUserId: String(current.responsible_user_id),
          version: version + 1,
          startedAt: after.started_at ? toBeijingISOString(after.started_at) : null,
          completedAt: null,
          batchStatus: startsTask ? 'doing' : batch.status,
          ...(startsTask ? { workOrderStatus: 'doing' } : {}),
        },
        stepAuditState(current),
      );
      return this.commandResult(connection, batchId, stepRecordId);
    });
  }

  completeStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext & { actorId: string },
    asAdministrator = false,
  ): Promise<ProductionStepCommandResult> {
    return executeStepStateCommand(
      this.pool,
      'complete',
      batchId,
      stepRecordId,
      { version },
      context,
      asAdministrator,
    );
  }

  reopenStep(
    batchId: string,
    stepRecordId: string,
    payload: ReopenProductionStepPayload,
    context: CommandContext & { actorId: string },
    asAdministrator = false,
  ): Promise<ProductionStepCommandResult> {
    return executeStepStateCommand(
      this.pool,
      'reopen',
      batchId,
      stepRecordId,
      payload,
      context,
      asAdministrator,
    );
  }

  async listStepExecutionHistory(
    batchId: string,
    stepRecordId: string,
    query: { page: number; pageSize: number },
    responsibleUserId?: string,
  ): Promise<PageResult<ProductionStepExecutionHistoryItem>> {
    const step = await lockExecutionStep(this.pool, batchId, stepRecordId, false);
    if (responsibleUserId && String(step.responsible_user_id) !== responsibleUserId)
      throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '该工序未分配给当前员工');
    return selectStepExecutionHistory(this.pool, batchId, stepRecordId, query);
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
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
      await lockWorkOrderForBatch(connection, batchId);
      const batch = await findBatch(connection, batchId, true);
      await requireUnfrozenStepActions(connection, batchId);
      if (
        batch.status === 'cancelled' ||
        batch.status === 'completed' ||
        batch.status === 'terminated' ||
        batch.status === 'closing'
      )
        throw new ProductionDomainError(
          'STEP_ASSIGNMENT_CONFLICT',
          '任务已结束执行或取消，不能调整派工',
        );
      const current = (await lockExecutionSteps(connection, batchId)).find(
        (step) => String(step.id) === stepRecordId,
      );
      if (!current) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
      if (responsibleUserId) {
        const active = await this.identity.listActiveUserOptionsByIds([responsibleUserId]);
        if (active.length !== 1)
          throw new ProductionDomainError('INVALID_INPUT', '派工员工不存在或已停用');
      }
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
        if (
          current.started_at !== null ||
          (await hasStepReportHistory(connection, stepRecordId, true))
        )
          throw new ProductionDomainError(
            'STEP_ASSIGNMENT_CONFLICT',
            '已有开工或报工历史的工序不能撤回派工',
          );
      } else {
        if (
          (current.status === 'assigned' ||
            current.status === 'doing' ||
            current.status === 'completed') &&
          String(current.responsible_user_id) === responsibleUserId
        )
          return this.commandResult(connection, batchId, stepRecordId);
        requireReassignableStep(current.status);
        if (
          (current.status === 'doing' || current.status === 'completed') &&
          batch.status !== 'doing'
        )
          throw new ProductionDomainError(
            'STEP_ASSIGNMENT_CONFLICT',
            '只有执行中的任务可以改派已开始工序',
          );
      }

      const targetStatus =
        action === 'unassign' ? 'pending' : action === 'assign' ? 'assigned' : current.status;
      const [updated] = await connection.execute<ResultSetHeader>(
        'UPDATE batch_step_records SET status=?,responsible_user_id=?,version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND version=?',
        [targetStatus, responsibleUserId, context.actorId, stepRecordId, batchId, version],
      );
      assertVersion(updated, '工序派工已被其他操作修改，请刷新后重试');
      await auditStep(
        connection,
        context,
        `production-step.${action}`,
        stepRecordId,
        {
          status: targetStatus,
          responsibleUserId,
          version: version + 1,
        },
        stepAuditState(current),
      );
      return this.commandResult(connection, batchId, stepRecordId);
    });
  }

  private async commandResult(
    connection: PoolConnection,
    batchId: string,
    stepRecordId: string,
  ): Promise<ProductionStepCommandResult> {
    const batch = await findBatch(connection, batchId, true);
    const step = await lockExecutionStep(connection, batchId, stepRecordId);
    return mapStepCommandResult(batchId, batch, stepRecordId, step);
  }
}

const assertVersion = (result: ResultSetHeader, message: string): void => {
  if (result.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', message);
};

const selectRequiredCompletionSteps = async (
  db: Db,
  batchId: string,
  lock = false,
): Promise<CompletionStepRow[]> => {
  const share = lock ? ' FOR SHARE' : '';
  const [rows] = await db.query<CompletionStepRow[]>(
    `SELECT sr.id,sr.step_order_snapshot,sr.step_name_snapshot,sr.status,
      COALESCE((SELECT SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END)
        FROM batch_step_reports r WHERE r.batch_step_record_id=sr.id${share}),0) effective_normal
     FROM batch_step_records sr
     WHERE sr.production_batch_id=?
     ORDER BY sr.step_order_snapshot,sr.id${share}`,
    [batchId],
  );
  return rows;
};

const mapCompletionCheck = (
  batchId: string,
  batch: BatchRow,
  steps: CompletionStepRow[],
  activeMaterialDemandCount: number,
  unfulfilledSupplementCount: number,
): ProductionExecutionCompletionCheck =>
  evaluateProductionExecutionCompletion({
    productionBatchId: batchId,
    batchStatus: batch.status,
    version: batch.version,
    plannedQuantity: String(batch.planned_quantity),
    orderType: batch.order_type,
    activeMaterialDemandCount,
    unfulfilledSupplementCount,
    requiredSteps: steps.map((step) => ({
      id: String(step.id),
      order: step.step_order_snapshot,
      name: step.step_name_snapshot,
      status: step.status,
      effectiveNormalQuantity: String(step.effective_normal),
    })),
  });

const throwCompletionBlocker = (check: ProductionExecutionCompletionCheck): never => {
  const blocker = check.blockers[0];
  if (blocker === 'unfulfilled_material_supplement')
    throw new ProductionDomainError(
      'BATCH_EXECUTION_COMPLETION_NOT_ALLOWED',
      '仍有未齐套补料单，不能正常完工；不再补产请办理批次收尾',
    );
  if (blocker === 'no_route_step')
    throw new ProductionDomainError('NO_REQUIRED_REPORTING_STEP', '批次没有工序，不能执行完工');
  if (blocker === 'required_step_incomplete')
    throw new ProductionDomainError('REQUIRED_STEP_INCOMPLETE', '仍有工序尚未完成');
  if (blocker === 'active_material_demand_remains')
    throw new ProductionDomainError(
      'ACTIVE_MATERIAL_DEMAND_REMAINS',
      '仍有未完成物料需求，请继续领料或显式关闭剩余需求后再完工',
    );
  throw new ProductionDomainError(
    'BATCH_EXECUTION_COMPLETION_NOT_ALLOWED',
    '只有生产执行中的批次可以确认完工',
  );
};

const countUnfulfilledSupplements = async (db: Db, batchId: string): Promise<number> => {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM production_material_supplement WHERE production_batch_id=? AND status='approved' FOR SHARE",
    [batchId],
  );
  return rows.length;
};
const countActiveMaterialDemands = async (
  db: Db,
  batchId: string,
  lock = false,
): Promise<number> => {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM production_item_demand
     WHERE production_batch_id=? AND business_status='active'${lock ? ' FOR SHARE' : ''}`,
    [batchId],
  );
  return rows.length;
};

const completionResult = (
  batchId: string,
  batch: BatchRow,
  closeoutId: string,
  lastStepReportedQuantity: string,
): ProductionExecutionCompletionResult => {
  if (
    (batch.status !== 'closing' && batch.status !== 'completed') ||
    !batch.execution_completed_at ||
    batch.execution_completed_by === null
  )
    throw new ProductionDomainError('CONFLICT', '生产任务执行完成结果不完整');
  return {
    productionBatchId: batchId,
    batchStatus: batch.status,
    closeoutId,
    lastStepReportedQuantity: String(lastStepReportedQuantity),
    executionCompletedAt: toBeijingISOString(batch.execution_completed_at),
    executionCompletedById: String(batch.execution_completed_by),
    version: batch.version,
  };
};
