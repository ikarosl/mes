import { ProductionDomainError } from './production.errors.js';

const scaled = (value: number | string): number => Math.round(Number(value) * 10_000);

export const requireReworkCompletionQuantities = (
  reworkQuantity: number | string,
  normalQuantity: number,
  abnormalQuantity: number,
): void => {
  if (
    normalQuantity < 0 ||
    abnormalQuantity < 0 ||
    scaled(normalQuantity) + scaled(abnormalQuantity) !== scaled(reworkQuantity)
  )
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '返工完成的正常与异常数量合计必须等于返工单数量',
    );
};
