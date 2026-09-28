export const PRODUCTION_CLOSEOUT_MODES = ['normal', 'early'] as const;
export const PRODUCTION_CLOSEOUT_MODE_LABELS = {
  normal: '正常生产结案',
  early: '提前结束结案',
} as const;
export const PRODUCTION_OUTPUT_STATUSES = ['draft', 'reviewing', 'approved', 'correcting'] as const;
export const PRODUCTION_OUTPUT_STATUS_LABELS = {
  draft: '待核对产出',
  reviewing: '结案审批中',
  approved: '已批准清单',
  correcting: '清单更正中',
} as const;
export const PRODUCTION_OUTPUT_QUANTITY_MAX = 99_999_999;

export const PRODUCTION_OUTPUT_ROUND_STATUSES = [
  'pending_inspection',
  'inspecting',
  'pending_finalization',
  'reviewing',
  'finalized',
  'superseded',
] as const;
export const PRODUCTION_OUTPUT_ROUND_STATUS_LABELS = {
  pending_inspection: '待检验',
  inspecting: '检验中',
  pending_finalization: '待定稿',
  reviewing: '审批中',
  finalized: '已定稿',
  superseded: '已替代',
} as const;
export const PRODUCTION_OUTPUT_ROUND_TRIGGERS = [
  'initial',
  'reinspection',
  'finalization_correction',
] as const;
