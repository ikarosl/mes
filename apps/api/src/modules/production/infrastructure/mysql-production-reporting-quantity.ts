import type { BatchStepStatus } from '@company/contracts';

type PreviousStepQuantity = {
  need_record_snapshot: number;
  status: BatchStepStatus;
  effective_normal: string;
};

export const fixed = (value: number | string): string => Number(value).toFixed(4);
export const add = (left: number | string, right: number | string): string =>
  fixed(Number(left) + Number(right));
export const subtract = (left: number | string, right: number | string): string =>
  fixed(Number(left) - Number(right));

export const releasedQuantity = (
  plannedQuantity: string,
  previous: PreviousStepQuantity | undefined,
): string => {
  if (!previous) return plannedQuantity;
  return previous.need_record_snapshot
    ? previous.effective_normal
    : previous.status === 'completed'
      ? plannedQuantity
      : '0.0000';
};
