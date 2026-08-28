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
  previousNeedRecord: boolean;
  previousStatus: BatchStepStatus;
  previousEffectiveNormal: number;
}): void => {
  if (input.batchStatus !== 'doing')
    throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '生产批次尚未进入执行中');
  const released = input.previousNeedRecord
    ? input.previousEffectiveNormal > 0
    : input.previousStatus === 'completed';
  if (!released)
    throw new ProductionDomainError(
      'STEP_START_NOT_ALLOWED',
      '上一道工序尚无可供下游执行的正常数量',
    );
};

export const requireNonReportingStepCompletable = (input: {
  batchStatus: ProductionBatchStatus;
  needRecord: boolean;
  status: BatchStepStatus;
  previousStatus: BatchStepStatus | null;
}): void => {
  if (input.needRecord)
    throw new ProductionDomainError(
      'STEP_COMPLETION_NOT_ALLOWED',
      '必须报工工序只能在有效正常数量达到要求时自动完成',
    );
  if (input.batchStatus !== 'doing' || input.status !== 'doing')
    throw new ProductionDomainError(
      'STEP_COMPLETION_NOT_ALLOWED',
      '只有生产执行中且已开工的无需报工工序可以完成',
    );
  if (input.previousStatus !== null && input.previousStatus !== 'completed')
    throw new ProductionDomainError(
      'STEP_COMPLETION_NOT_ALLOWED',
      '上一道工序尚未完成，当前工序不能确认完成',
    );
};
