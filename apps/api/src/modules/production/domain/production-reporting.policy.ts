import { ProductionDomainError } from './production.errors.js';
import type { BatchStepAbnormalOrigin } from '@company/contracts';

const SCALE = 10_000;
const scaled = (value: number | string): number => Math.round(Number(value) * SCALE);

export const requireReportQuantities = (normalQuantity: number, abnormalQuantity: number): void => {
  if (normalQuantity < 0 || abnormalQuantity < 0 || normalQuantity + abnormalQuantity <= 0)
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
    scaled(currentEffectiveReported) + scaled(normalDelta) + scaled(abnormalDelta) >
    scaled(releasedQuantity)
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
  if (scaled(correctedEffectiveNormal) < scaled(downstreamEffectiveReported))
    throw new ProductionDomainError(
      'DOWNSTREAM_QUANTITY_CONFLICT',
      '更正后的正常放行量低于下游已报正常与异常总量',
      details,
    );
};

export const isRequiredNormalCompleted = (
  effectiveNormal: number | string,
  requiredNormal: number | string,
): boolean => scaled(effectiveNormal) === scaled(requiredNormal);
