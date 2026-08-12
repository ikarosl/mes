import { ProductionDomainError } from './production.errors.js';

const SCALE = 10_000;
const scaled = (value: number | string): number => Math.round(Number(value) * SCALE);

export const requireReportQuantities = (normalQuantity: number, abnormalQuantity: number): void => {
  if (normalQuantity < 0 || abnormalQuantity < 0 || normalQuantity + abnormalQuantity <= 0)
    throw new ProductionDomainError('INVALID_INPUT', '本次报工数量必须大于零且不能为负数');
};

export const requireNormalWithinRequired = (
  currentEffectiveNormal: number | string,
  normalDelta: number | string,
  requiredNormal: number | string,
): void => {
  if (scaled(currentEffectiveNormal) + scaled(normalDelta) > scaled(requiredNormal))
    throw new ProductionDomainError(
      'STEP_REPORT_QUANTITY_EXCEEDED',
      '本次正常数量超过当前已放行的可报数量',
    );
};

export const requireNoDownstreamQuantityConflict = (
  correctedEffectiveNormal: number | string,
  downstreamEffectiveNormal: number | string,
): void => {
  if (scaled(correctedEffectiveNormal) < scaled(downstreamEffectiveNormal))
    throw new ProductionDomainError(
      'DOWNSTREAM_QUANTITY_CONFLICT',
      '更正后的正常数量低于下游已报正常数量',
    );
};

export const isRequiredNormalCompleted = (
  effectiveNormal: number | string,
  requiredNormal: number | string,
): boolean => scaled(effectiveNormal) === scaled(requiredNormal);
