import { formatQuantity } from './production-status';

/** 审定可用产出只含计划内、计划外合格品，不含报废或实际入库量。 */
export const approvedUsableQuantity = (
  output: { availableQuantity: string; extraQuantity: string } | null | undefined,
): number => Number(output?.availableQuantity ?? 0) + Number(output?.extraQuantity ?? 0);

/** 终止任务释放计划额度后，累计审定量可能超出工单计划。 */
export const plannedOutputGapText = (gap: string | number): string => {
  const value = Number(gap);
  if (value > 0) return `缺口 ${formatQuantity(value)}`;
  if (value < 0) return `超出 ${formatQuantity(-value)}`;
  return '已达计划';
};
