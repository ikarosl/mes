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
