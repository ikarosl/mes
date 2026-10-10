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

/** 只把服务端可信分类换成视觉宽度，不补差额，也不参与报工资格。 */
export const stepQuotaDistributionSegments = (
  step: Pick<
    BatchStepExecutionRecordItem,
    | 'quotaDistribution'
    | 'effectiveNormalQuantity'
    | 'availableReportQuantity'
    | 'upperLimitQuantity'
  >,
) => {
  const distribution = step.quotaDistribution;
  if (!distribution.isReliable) return null;
  const segments = [
    { key: 'normal', label: '正常', quantity: step.effectiveNormalQuantity },
    { key: 'scrapped', label: '已报废', quantity: distribution.scrappedQuantity },
    { key: 'processing', label: '处理中', quantity: distribution.processingQuantity },
    { key: 'terminated', label: '已终止未恢复', quantity: distribution.terminatedQuantity },
    { key: 'available', label: '剩余额度', quantity: step.availableReportQuantity },
  ];
  const upperLimit = Number(step.upperLimitQuantity);
  if (
    !Number.isSafeInteger(upperLimit) ||
    upperLimit < 0 ||
    segments.some(
      ({ quantity }) =>
        quantity === null || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 0,
    ) ||
    segments.reduce((total, segment) => total + Number(segment.quantity), 0) !== upperLimit
  )
    return null;
  if (upperLimit === 0) return [];
  return segments
    .filter(({ quantity }) => Number(quantity) > 0)
    .map((segment) => ({ ...segment, width: `${(Number(segment.quantity) / upperLimit) * 100}%` }));
};
