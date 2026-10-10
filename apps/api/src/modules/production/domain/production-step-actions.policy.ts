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
  isFirstStep: boolean;
  pendingApprovalId: string | null;
}

/** 执行资格由任务阶段决定，报工数量不参与状态动作判定。 */
export function evaluateProductionStepActionAvailability(
  input: ProductionStepActionState,
): ProductionStepActionAvailability {
  const frozen = input.pendingApprovalId !== null;
  const executing = input.batchStatus === 'doing';
  const startBlockedReason = frozen
    ? '结案或产出更正在审批，工序状态被冻结'
    : !input.hasResponsibleUser
      ? '工序尚未派工'
      : input.stepStatus !== 'assigned' || input.hasStarted
        ? '只有已派工且未开始的工序可以开始'
        : !executing
          ? '请由管理员先明确开始任务执行；结束执行后工序只读'
          : null;
  const executionBlockedReason = frozen
    ? '结案或产出更正在审批，工序状态被冻结'
    : !executing
      ? '任务已结束执行，工序状态只读'
      : !input.hasStarted
        ? '工序尚未实际开始'
        : null;
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
