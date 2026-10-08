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
export const FINISHED_INSPECTION_STAGES = [
  'awaiting_draft',
  'awaiting_start',
  'inspecting',
  'needs_reinspection',
  'not_released',
  'ready_for_finalization',
  'reviewing',
  'approved',
  'blocked',
] as const;
export const FINISHED_INSPECTION_STAGE_LABELS = {
  awaiting_draft: '待保存产出草稿',
  awaiting_start: '待开始检验',
  inspecting: '待填写检验结果',
  needs_reinspection: '待复检',
  not_released: '未放行待处理',
  ready_for_finalization: '待核对产出清单',
  reviewing: '清单审批中',
  approved: '已定稿',
  blocked: '当前不可办理',
} as const;
export const FINISHED_INSPECTION_NEXT_ACTIONS = [
  'save_draft',
  'start_inspection',
  'record_inspection',
  'start_reinspection',
  'review_output',
  'view_approval',
  'view_history',
] as const;
export const FINISHED_INSPECTION_NEXT_ACTION_LABELS = {
  save_draft: '保存产出草稿',
  start_inspection: '开始检验',
  record_inspection: '填写结果',
  start_reinspection: '开始复检',
  review_output: '核对产出清单',
  view_approval: '查看审批',
  view_history: '查看记录',
} as const;

export const PRODUCTION_OUTPUT_INSPECTION_METHODS = QUALITY_INSPECTION_METHODS;
export const PRODUCTION_OUTPUT_INSPECTION_METHOD_LABELS = QUALITY_INSPECTION_METHOD_LABELS;
export const PRODUCTION_OUTPUT_RELEASE_DECISIONS = QUALITY_RELEASE_DECISIONS;
export const PRODUCTION_OUTPUT_RELEASE_DECISION_LABELS = QUALITY_RELEASE_DECISION_LABELS;
