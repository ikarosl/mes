import type { BatchStepStatus } from '@company/contracts';
import { fixedIntegerQuantity, integerQuantity } from '../domain/integer-quantity.js';

type PreviousStepQuantity = {
  need_record_snapshot: number;
  status: BatchStepStatus;
  effective_normal: string;
};

export const fixed = fixedIntegerQuantity;
export const add = (left: number | string, right: number | string): string =>
  fixed(integerQuantity(left) + integerQuantity(right));
export const subtract = (left: number | string, right: number | string): string =>
  fixed(integerQuantity(left) - integerQuantity(right));

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
