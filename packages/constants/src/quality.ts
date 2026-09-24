export const QUALITY_INBOUND_CASE_TYPES = [
  'initial',
  'reinspection',
  'inspection_correction',
  'receipt_correction',
] as const;
export const QUALITY_INBOUND_CASE_STATUSES = ['reviewing', 'completed', 'superseded'] as const;
export const QUALITY_INSPECTION_SOURCE_KINDS = ['incoming', 'finished'] as const;
export const QUALITY_INSPECTION_METHODS = ['full', 'sampling', 'zero_confirmation'] as const;
export const QUALITY_INSPECTION_METHOD_LABELS = {
  full: '全检',
  sampling: '抽检',
  zero_confirmation: '零数量核实',
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
export const QUALITY_INBOUND_METHOD_LABELS = QUALITY_INSPECTION_METHOD_LABELS;
export const QUALITY_INBOUND_TEXT_MAX_LENGTH = 4000;
export const QUALITY_INBOUND_TASK_STATUSES = [
  'uninspected',
  ...QUALITY_INBOUND_CASE_STATUSES,
] as const;
export const QUALITY_INBOUND_TASK_STATUS_LABELS = {
  uninspected: '待检',
  ...QUALITY_INBOUND_CASE_STATUS_LABELS,
} as const;

export const FINISHED_INSPECTION_LIST_STATUSES = ['pending', 'recorded'] as const;
export const FINISHED_INSPECTION_LIST_STATUS_LABELS = {
  pending: '待检 / 待复检',
  recorded: '已有检验记录',
} as const;

export const PRODUCTION_OUTPUT_INSPECTION_METHODS = QUALITY_INSPECTION_METHODS;
export const PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS = QUALITY_INSPECTION_METHOD_LABELS;
export const PRODUCTION_OUTPUT_RELEASE_DECISIONS = QUALITY_RELEASE_DECISIONS;
export const PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS = QUALITY_RELEASE_DECISION_LABELS;
