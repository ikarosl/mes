/** 新办理排除 inspection_correction；该值仅在历史契约和展示映射中保留。 */
export const QUALITY_INBOUND_CASE_START_TYPES = [
  'initial',
  'reinspection',
  'receipt_correction',
] as const;
export const QUALITY_INSPECTION_METHOD_LABELS = {
  full: '全检',
  sampling: '抽检',
} as const;
export const QUALITY_RELEASE_DECISIONS = [
  'released',
  'pending_reinspection',
  'not_released',
] as const;
export const QUALITY_RELEASE_DECISION_LABELS = {
  released: '剔除不合格后放行',
  pending_reinspection: '待全检或复检',
  not_released: '不放行',
} as const;
export const QUALITY_INBOUND_METHODS = ['full', 'sampling'] as const;
export const QUALITY_INBOUND_CASE_TYPE_LABELS = {
  initial: '初次检验',
  reinspection: '主动复检',
  inspection_correction: '检验更正',
  receipt_correction: '实收更正复核',
} as const;
export const QUALITY_INBOUND_CASE_STATUS_LABELS = {
  reviewing: '检验中',
  completed: '已完成',
  superseded: '已失效',
} as const;
export const QUALITY_INBOUND_TEXT_MAX_LENGTH = 4000;
/** 单次分组命令的到货数量上限，不限制主单累计关联数。 */
export const QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS = 100;
export const QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH = 500;
export const QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATIONS = [
  'unassigned',
  'assigned',
  'all',
] as const;
export const QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATION_LABELS = {
  unassigned: '未关联到货',
  assigned: '已关联到货',
  all: '全部到货',
} as const;
