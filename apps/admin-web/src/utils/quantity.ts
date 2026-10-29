/** 整数数量格式化：千分位分隔；非法值显示 `-`。 */
export const formatQuantity = (value: string | number | null | undefined): string => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
    : '-';
};
