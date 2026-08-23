import { ProductionDomainError } from './production.errors.js';
import { integerQuantity } from './integer-quantity.js';

export const requireReworkCompletionQuantities = (
  reworkQuantity: number | string,
  normalQuantity: number,
  abnormalQuantity: number,
): void => {
  let rework: number;
  let normal: number;
  let abnormal: number;
  try {
    rework = integerQuantity(reworkQuantity);
    normal = integerQuantity(normalQuantity);
    abnormal = integerQuantity(abnormalQuantity);
  } catch {
    throw new ProductionDomainError('INVALID_INPUT', '返工完成数量必须为整数');
  }
  if (normal < 0 || abnormal < 0 || normal + abnormal !== rework)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '返工完成的正常与异常数量合计必须等于返工单数量',
    );
};
