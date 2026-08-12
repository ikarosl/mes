import { ProductionDomainError } from './production.errors.js';

const SCALE = 10_000;
const scaled = (value: number | string): number => Math.round(Number(value) * SCALE);

export const requireReportQuantities = (normalQuantity: number, abnormalQuantity: number): void => {
  if (normalQuantity < 0 || abnormalQuantity < 0 || normalQuantity + abnormalQuantity <= 0)
    throw new ProductionDomainError('INVALID_INPUT', '本次报工数量必须大于零且不能为负数');
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
): void => {
  if (scaled(correctedEffectiveNormal) < scaled(downstreamEffectiveReported))
    throw new ProductionDomainError(
      'DOWNSTREAM_QUANTITY_CONFLICT',
      '更正后的正常放行量低于下游已报正常与异常总量',
    );
};

export const isRequiredNormalCompleted = (
  effectiveNormal: number | string,
  requiredNormal: number | string,
): boolean => scaled(effectiveNormal) === scaled(requiredNormal);
