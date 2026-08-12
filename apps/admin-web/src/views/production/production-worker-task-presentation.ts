import type { ProductionWorkerTaskItem } from '@company/contracts';
import { quantityProgressPercentage } from './production-list-presentation';

export const workerTaskRemainingNormal = (task: ProductionWorkerTaskItem): number =>
  Math.max(Number(task.requiredNormalQuantity) - Number(task.effectiveNormalQuantity), 0);

export const workerTaskProgressPercentage = (task: ProductionWorkerTaskItem): number =>
  quantityProgressPercentage(task.effectiveNormalQuantity, task.requiredNormalQuantity);

export const workerTaskHasAbnormal = (task: ProductionWorkerTaskItem): boolean =>
  Number(task.effectiveAbnormalQuantity) > 0;

export const workerTaskRiskClass = (task: ProductionWorkerTaskItem): string => {
  if (workerTaskHasAbnormal(task)) return 'risk-error-row';
  if (task.status === 'assigned' && !task.canStart) return 'risk-warning-row';
  return '';
};
