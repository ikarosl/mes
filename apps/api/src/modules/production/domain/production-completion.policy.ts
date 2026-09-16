import type {
  BatchStepStatus,
  ProductionBatchStatus,
  ProductionExecutionCompletionBlocker,
  ProductionExecutionCompletionCheck,
} from '@company/contracts';
import { integerQuantity } from './integer-quantity.js';

export interface RequiredCompletionStep {
  id: string;
  order: number;
  name: string;
  status: BatchStepStatus;
  effectiveNormalQuantity: string;
}

export const evaluateProductionExecutionCompletion = (input: {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  version: number;
  plannedQuantity: string;
  activeMaterialDemandCount?: number;
  unfulfilledSupplementCount?: number;
  requiredSteps: RequiredCompletionStep[];
}): ProductionExecutionCompletionCheck => {
  const requiredSteps = [...input.requiredSteps].sort(
    (left, right) => left.order - right.order || Number(left.id) - Number(right.id),
  );
  const finalStep = requiredSteps.at(-1) ?? null;
  const blockers: ProductionExecutionCompletionBlocker[] = [];
  if (input.batchStatus !== 'doing') blockers.push('batch_not_doing');
  if (requiredSteps.length === 0) blockers.push('no_route_step');
  if (requiredSteps.some((step) => step.status !== 'completed'))
    blockers.push('required_step_incomplete');
  if (
    finalStep &&
    integerQuantity(finalStep.effectiveNormalQuantity) !== integerQuantity(input.plannedQuantity)
  )
    blockers.push('final_step_quantity_insufficient');
  if ((input.activeMaterialDemandCount ?? 0) > 0) blockers.push('active_material_demand_remains');
  if ((input.unfulfilledSupplementCount ?? 0) > 0) blockers.push('unfulfilled_material_supplement');

  return {
    productionBatchId: input.productionBatchId,
    batchStatus: input.batchStatus,
    version: input.version,
    plannedQuantity: input.plannedQuantity,
    requiredStepCount: requiredSteps.length,
    completedRequiredStepCount: requiredSteps.filter((step) => step.status === 'completed').length,
    finalRequiredStepId: finalStep?.id ?? null,
    finalRequiredStepName: finalStep?.name ?? null,
    finalEffectiveNormalQuantity: finalStep?.effectiveNormalQuantity ?? '0.0000',
    activeMaterialDemandCount: input.activeMaterialDemandCount ?? 0,
    unfulfilledSupplementCount: input.unfulfilledSupplementCount ?? 0,
    canComplete: blockers.length === 0,
    blockers,
  };
};
