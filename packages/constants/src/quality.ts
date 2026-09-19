export const QUALITY_INBOUND_CASE_TYPES = [
  'initial',
  'reinspection',
  'inspection_correction',
  'receipt_correction',
] as const;
export const QUALITY_INBOUND_CASE_STATUSES = ['reviewing', 'completed', 'superseded'] as const;
export const QUALITY_INBOUND_METHODS = ['full', 'sampling', 'review_only'] as const;
export const QUALITY_INBOUND_DISPOSITIONS = [
  'release',
  'await_full_inspection',
  'await_decision',
  'return_all',
  'receipt_zero_confirmed',
] as const;
export const QUALITY_INBOUND_CASE_TYPE_LABELS = {
  initial: '初次检验',
  reinspection: '主动复检',
  inspection_correction: '检验更正',
  receipt_correction: '实收更正复核',
} as const;
export const QUALITY_INBOUND_CASE_STATUS_LABELS = {
  reviewing: '复核中',
  completed: '已完成',
  superseded: '已由实收更正替代',
} as const;
export const QUALITY_INBOUND_METHOD_LABELS = {
  full: '全检',
  sampling: '抽检',
  review_only: '零数量核实',
} as const;
export const QUALITY_INBOUND_DISPOSITION_LABELS = {
  release: '批准入库',
  await_full_inspection: '转全检',
  await_decision: '待决定',
  return_all: '整批退回',
  receipt_zero_confirmed: '零数量已核实',
} as const;
export const QUALITY_INBOUND_TEXT_MAX_LENGTH = 4000;
export const QUALITY_INBOUND_TASK_STATUSES = [
  'uninspected',
  ...QUALITY_INBOUND_CASE_STATUSES,
] as const;
export const QUALITY_INBOUND_TASK_STATUS_LABELS = {
  uninspected: '待检',
  ...QUALITY_INBOUND_CASE_STATUS_LABELS,
} as const;
