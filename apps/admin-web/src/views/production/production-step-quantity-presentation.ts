import type {
  BatchStepExecutionRecordItem,
  ProductionStepQuantityProjection,
} from '@company/contracts';

/** 完整正常投影中的返工恢复净量；不从报工分页或返工整单数量重算。 */
export const stepReworkRecoveredQuantity = (
  step: Pick<
    ProductionStepQuantityProjection,
    'effectiveNormalQuantity' | 'effectiveDirectNormalQuantity'
  >,
): number => Number(step.effectiveNormalQuantity) - Number(step.effectiveDirectNormalQuantity);

/** 分类展示须同时满足服务端可信标记及数量守恒；不补差额，也不参与报工资格。 */
export const isStepQuotaDistributionReliable = (
  step: Pick<
    BatchStepExecutionRecordItem,
    | 'quotaDistribution'
    | 'effectiveNormalQuantity'
    | 'availableReportQuantity'
    | 'upperLimitQuantity'
  >,
): boolean => {
  const distribution = step.quotaDistribution;
  if (!distribution.isReliable) return false;
  const quantities = [
    step.effectiveNormalQuantity,
    distribution.scrappedQuantity,
    distribution.processingQuantity,
    distribution.terminatedQuantity,
    step.availableReportQuantity,
  ];
  const upperLimit = Number(step.upperLimitQuantity);
  if (
    !Number.isSafeInteger(upperLimit) ||
    upperLimit < 0 ||
    quantities.some(
      (quantity) =>
        quantity === null || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 0,
    ) ||
    quantities.reduce((total: number, quantity) => total + Number(quantity), 0) !== upperLimit
  )
    return false;
  return true;
};
