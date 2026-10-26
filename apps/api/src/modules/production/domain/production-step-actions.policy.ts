import type {
  BatchStepStatus,
  ProductionBatchStatus,
  ProductionStepActionAvailability,
} from '@company/contracts';

export interface ProductionStepActionState {
  batchStatus: ProductionBatchStatus;
  stepStatus: BatchStepStatus;
  hasStarted: boolean;
  hasResponsibleUser: boolean;
  pendingApprovalId: string | null;
}

/** 执行资格由任务阶段决定，报工数量不参与状态动作判定。 */
export function evaluateProductionStepActionAvailability(
  input: ProductionStepActionState,
): ProductionStepActionAvailability {
  const frozen = input.pendingApprovalId !== null;
  const executing = input.batchStatus === 'doing';
  const startBlockedReason = stepStartBlockedReason(input, frozen, executing);
  const executionBlockedReason = stepExecutionBlockedReason(input, frozen, executing);
  const completeBlockedReason =
    executionBlockedReason ??
    (input.stepStatus === 'doing' ? null : '只有进行中的工序可以明确完成');
  const reopenBlockedReason =
    executionBlockedReason ??
    (input.stepStatus === 'completed' ? null : '只有已完成的工序可以重新打开');

  return {
    canStart: startBlockedReason === null,
    startBlockedReason,
    canComplete: completeBlockedReason === null,
    completeBlockedReason,
    canReopen: reopenBlockedReason === null,
    reopenBlockedReason,
  };
}

function stepStartBlockedReason(
  input: ProductionStepActionState,
  frozen: boolean,
  executing: boolean,
): string | null {
  if (frozen) return '结案或产出更正在审批，工序状态被冻结';
  if (!input.hasResponsibleUser) return '工序尚未派工';
  if (input.stepStatus !== 'assigned' || input.hasStarted)
    return '只有已派工且未开始的工序可以开始';
  if (!executing) return '请由管理员先明确开始任务执行；结束执行后工序只读';
  return null;
}

function stepExecutionBlockedReason(
  input: ProductionStepActionState,
  frozen: boolean,
  executing: boolean,
): string | null {
  if (frozen) return '结案或产出更正在审批，工序状态被冻结';
  if (!executing) return '任务已结束执行，工序状态只读';
  if (!input.hasStarted) return '工序尚未实际开始';
  return null;
}
