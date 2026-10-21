import { beijingTodayUtc } from '../../utils/date';
import type { ProductionExecutionBatchSummary } from '@company/contracts';

export const executionBatchHasAbnormal = (batch: ProductionExecutionBatchSummary): boolean =>
  Number(batch.effectiveAbnormalQuantity) > 0 || batch.pendingAbnormalCount > 0;

export const executionBatchProgressPercentage = (batch: ProductionExecutionBatchSummary): number =>
  batch.totalStepCount > 0
    ? Math.round((batch.completedStepCount / batch.totalStepCount) * 100)
    : 0;

export const executionBatchOverdueDays = (
  batch: ProductionExecutionBatchSummary,
  now = new Date(),
): number => {
  if (
    !batch.planEndDate ||
    batch.status === 'completed' ||
    batch.status === 'cancelled' ||
    batch.status === 'terminated'
  )
    return 0;
  const [year, month, day] = batch.planEndDate.split('-').map(Number);
  if (!year || !month || !day) return 0;
  return Math.max(
    0,
    Math.floor((beijingTodayUtc(now) - Date.UTC(year, month - 1, day)) / 86_400_000),
  );
};

export const executionBatchRiskClass = (batch: ProductionExecutionBatchSummary): string =>
  executionBatchHasAbnormal(batch)
    ? 'risk-error'
    : executionBatchOverdueDays(batch) > 0
      ? 'risk-warning'
      : '';
