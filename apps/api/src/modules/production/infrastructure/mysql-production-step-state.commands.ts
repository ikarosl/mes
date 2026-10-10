import { withTransaction } from '@company/database';
import type { Pool, ResultSetHeader } from 'mysql2/promise';
import type { ProductionStepCommandResult } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { evaluateProductionStepActionAvailability } from '../domain/production-step-actions.policy.js';
import { findBatch } from './mysql-production.shared.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import {
  appendStepExecutionAction,
  requireUnfrozenStepActions,
  lockExecutionSteps,
  lockExecutionStep,
  auditStep,
  stepAuditState,
  mapStepCommandResult,
} from './mysql-production-step-actions.persistence.js';

/** 只更改工序状态；首工启动及任务结束继续由执行 Repository 负责。 */
export const executeStepStateCommand = (
  pool: Pool,
  action: 'complete' | 'reopen',
  batchId: string,
  stepRecordId: string,
  payload: {
    version: number;
    reason?: string;
  },
  context: CommandContext & { actorId: string },
  asAdministrator: boolean,
): Promise<ProductionStepCommandResult> => {
  return withTransaction(pool, async (connection) => {
    await lockWorkOrderForBatch(connection, batchId);
    const batch = await findBatch(connection, batchId, true);
    await requireUnfrozenStepActions(connection, batchId);
    const steps = await lockExecutionSteps(connection, batchId);
    const current = steps.find((step) => String(step.id) === stepRecordId);
    if (!current) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
    if (!asAdministrator && String(current.responsible_user_id) !== context.actorId)
      throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '只有当前派工员工可以办理该工序');
    if (current.version !== payload.version)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '工序状态已变化，请刷新后重试');
    const availability = evaluateProductionStepActionAvailability({
      batchStatus: batch.status,
      stepStatus: current.status,
      hasStarted: current.started_at !== null,
      hasResponsibleUser: current.responsible_user_id !== null,
      isFirstStep: steps[0]?.id === current.id,
      pendingApprovalId: null,
    });
    const reason = payload.reason?.trim();
    if (action === 'reopen' && (!reason || reason.length > 1000))
      throw new ProductionDomainError('INVALID_INPUT', '请填写一千字以内的重开原因');
    const permitted = action === 'complete' ? availability.canComplete : availability.canReopen;
    if (!permitted)
      throw new ProductionDomainError(
        'INVALID_STATE',
        (action === 'complete'
          ? availability.completeBlockedReason
          : availability.reopenBlockedReason) ?? '工序状态不允许该动作',
      );
    const targetStatus = action === 'complete' ? 'completed' : 'doing';
    const [updated] = await connection.execute<ResultSetHeader>(
      `UPDATE batch_step_records SET status=?,
         completed_at=${targetStatus === 'completed' ? 'NOW()' : 'NULL'},
         version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND version=?`,
      [targetStatus, context.actorId, stepRecordId, batchId, payload.version],
    );
    if (updated.affectedRows !== 1)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '工序状态已变化，请刷新后重试');
    const after = await lockExecutionStep(connection, batchId, stepRecordId, false);
    await appendStepExecutionAction(connection, {
      batchId,
      stepRecordId,
      actionType: action,
      ...(reason ? { reason } : {}),
      actorId: context.actorId,
      before: current,
      after,
    });
    await auditStep(
      connection,
      context,
      `production-step.${action}`,
      stepRecordId,
      {
        ...stepAuditState(after),
        reason: reason ?? null,
      },
      stepAuditState(current),
    );
    return mapStepCommandResult(batchId, batch, stepRecordId, after);
  });
};
