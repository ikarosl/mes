import type {
  BatchStepStatus,
  ProductionBatchStatus,
  ProductionExecutionCompletionBlocker,
  ProductionExecutionCompletionCheck,
  WorkOrderType,
} from '@company/contracts';

export interface RequiredCompletionStep {
  status: BatchStepStatus;
}

export const evaluateProductionExecutionCompletion = (input: {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  version: number;
  closeoutId?: string | null;
  closeoutVersion?: number | null;
  plannedQuantity: string;
  orderType?: WorkOrderType;
  activeMaterialDemandCount?: number;
  unfulfilledSupplementCount?: number;
  requiredSteps: RequiredCompletionStep[];
}): ProductionExecutionCompletionCheck => {
  const requiredSteps = input.requiredSteps;
  const blockers: ProductionExecutionCompletionBlocker[] = [];
  if (input.batchStatus !== 'doing') blockers.push('batch_not_doing');
  const research = input.orderType === 'research';
  if (!research && requiredSteps.length === 0) blockers.push('no_route_step');
  if (!research && requiredSteps.some((step) => step.status !== 'completed'))
    blockers.push('required_step_incomplete');
  // 剩余需求和未履约补料只作核对信息，统一留在结案中逐项处理。

  return {
    productionBatchId: input.productionBatchId,
    batchStatus: input.batchStatus,
    version: input.version,
    closeoutId: input.closeoutId ?? null,
    closeoutVersion: input.closeoutVersion ?? null,
    plannedQuantity: input.plannedQuantity,
    requiredStepCount: requiredSteps.length,
    completedRequiredStepCount: requiredSteps.filter((step) => step.status === 'completed').length,
    activeMaterialDemandCount: input.activeMaterialDemandCount ?? 0,
    unfulfilledSupplementCount: input.unfulfilledSupplementCount ?? 0,
    canComplete: blockers.length === 0,
    blockers,
  };
};
