import { ProductionDomainError } from './production.errors.js';
import { integerQuantity, MAX_PERSISTED_INTEGER_QUANTITY } from './integer-quantity.js';
import type { BatchStepAbnormalOrigin } from '@company/contracts';

export const requireReportQuantities = (normalQuantity: number, abnormalQuantity: number): void => {
  let normal: number;
  let abnormal: number;
  try {
    normal = integerQuantity(normalQuantity);
    abnormal = integerQuantity(abnormalQuantity);
  } catch {
    throw new ProductionDomainError('INVALID_INPUT', '本次报工数量必须为整数');
  }
  if (
    normal < 0 ||
    abnormal < 0 ||
    normal + abnormal <= 0 ||
    normal + abnormal > MAX_PERSISTED_INTEGER_QUANTITY
  )
    throw new ProductionDomainError('INVALID_INPUT', '本次报工数量必须大于零且不能为负数');
};

export const requireDirectReportQuantities = (
  normalQuantity: number,
  abnormalQuantity: number,
): void => {
  requireReportQuantities(normalQuantity, abnormalQuantity);
  if (normalQuantity > 0 && abnormalQuantity > 0)
    throw new ProductionDomainError('INVALID_INPUT', '正常报工与异常报工必须分别提交');
};

export const requireAbnormalOrigin = (
  abnormalQuantity: number,
  abnormalOrigin: BatchStepAbnormalOrigin | null | undefined,
): BatchStepAbnormalOrigin | null => {
  if (abnormalQuantity > 0 && !abnormalOrigin)
    throw new ProductionDomainError('INVALID_INPUT', '存在异常数量时必须选择本工序异常或前置异常');
  if (abnormalQuantity === 0 && abnormalOrigin)
    throw new ProductionDomainError('INVALID_INPUT', '没有异常数量时不得填写异常来源');
  return abnormalQuantity > 0 ? abnormalOrigin! : null;
};

export const requireReportWithinReleased = (
  currentEffectiveReported: number | string,
  normalDelta: number | string,
  abnormalDelta: number | string,
  releasedQuantity: number | string,
): void => {
  if (
    integerQuantity(currentEffectiveReported) +
      integerQuantity(normalDelta) +
      integerQuantity(abnormalDelta) >
    integerQuantity(releasedQuantity)
  )
    throw new ProductionDomainError(
      'STEP_REPORT_QUANTITY_EXCEEDED',
      '本次正常与异常数量合计超过当前已放行的可报数量',
    );
};

export const requireNoDownstreamQuantityConflict = (
  correctedEffectiveNormal: number | string,
  downstreamEffectiveReported: number | string,
  details?: Record<string, unknown>,
): void => {
  if (integerQuantity(correctedEffectiveNormal) < integerQuantity(downstreamEffectiveReported))
    throw new ProductionDomainError(
      'DOWNSTREAM_QUANTITY_CONFLICT',
      '更正后的正常放行量低于下游已报正常与异常总量',
      details,
    );
};

export const isRequiredNormalCompleted = (
  effectiveNormal: number | string,
  requiredNormal: number | string,
): boolean => integerQuantity(effectiveNormal) === integerQuantity(requiredNormal);
