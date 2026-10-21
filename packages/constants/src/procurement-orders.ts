export const PURCHASE_ORDER_SOURCE_TYPES = ['demand', 'stock'] as const;
export const PURCHASE_ORDER_SOURCE_TYPE_LABELS = {
  demand: '按需求采购',
  stock: '独立备料采购',
} as const;
export const PURCHASE_ORDER_STATUSES = ['draft', 'ordered', 'completed', 'cancelled'] as const;
export const PURCHASE_ORDER_STATUS_LABELS = {
  draft: '草稿',
  ordered: '已下单',
  completed: '已结束',
  cancelled: '已取消',
} as const;
export const PURCHASE_ORDER_LINE_STATUS_LABELS = {
  draft: '草稿',
  open: '进行中',
  closed: '已结束',
  cancelled: '已取消',
} as const;
export const PURCHASE_ORDER_SUPPLEMENT_REASON_LABELS = {
  excess_purchase: '超量补单',
  quality_replacement: '质量补发',
} as const;
export const PURCHASE_ORDER_MAX_LINES = 100;
export const PURCHASE_ORDER_MAX_DEMANDS = 100;
export const PURCHASE_ORDER_MAX_QUANTITY = 99999999;
export const PURCHASE_ORDER_SUPPLEMENT_REASONS = [
  'excess_purchase',
  'quality_replacement',
] as const;
