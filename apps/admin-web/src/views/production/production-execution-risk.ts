import type { ProductionExecutionBatchSummary } from '@company/contracts';

const beijingTodayUtc = (now = new Date()): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(value('year'), value('month') - 1, value('day'));
};

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
  if (!batch.planEndDate || batch.status === 'completed' || batch.status === 'cancelled') return 0;
  const [year, month, day] = batch.planEndDate.slice(0, 10).split('-').map(Number);
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
