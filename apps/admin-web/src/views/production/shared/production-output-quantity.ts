import { formatQuantity } from '../../../utils/quantity';

/** 实际最终产出由终检确认事实汇总。 */
export const approvedUsableQuantity = (
  output: { availableQuantity: string } | null | undefined,
): number => Number(output?.availableQuantity ?? 0);

/** 实际最终产出与工单计划比较，负缺口表示超出计划。 */
export const plannedOutputGapText = (gap: string | number): string => {
  const value = Number(gap);
  if (value > 0) return `缺口 ${formatQuantity(value)}`;
  if (value < 0) return `超出 ${formatQuantity(-value)}`;
  return '已达计划';
};
