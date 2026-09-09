import type { BatchStepStatus, ProductionBatchStatus } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

export const requireAssignableStep = (status: BatchStepStatus): void => {
  if (status !== 'pending')
    throw new ProductionDomainError('STEP_ASSIGNMENT_CONFLICT', '只有待派工工序可以执行派工');
};

export const requireAssignedStep = (status: BatchStepStatus): void => {
  if (status !== 'assigned')
    throw new ProductionDomainError(
      'STEP_ASSIGNMENT_CONFLICT',
      '只有已派工且未开工的工序可以撤回或改派',
    );
};

export const requireFirstStepStartable = (
  batchStatus: ProductionBatchStatus,
  shortBatchStartAllowed = false,
): void => {
  if (
    batchStatus !== 'material_outbound' &&
    !(batchStatus === 'material_partially_outbound' && shortBatchStartAllowed)
  )
    throw new ProductionDomainError(
      'STEP_START_NOT_ALLOWED',
      '第一道工序只能在生产领料全部出库后开工',
    );
};

export const requireFollowingStepStartable = (input: {
  batchStatus: ProductionBatchStatus;
  previousEffectiveNormal: number;
}): void => {
  if (input.batchStatus !== 'doing')
    throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '生产批次尚未进入执行中');
  if (input.previousEffectiveNormal <= 0)
    throw new ProductionDomainError(
      'STEP_START_NOT_ALLOWED',
      '上一道工序尚无可供下游执行的正常数量',
    );
};
