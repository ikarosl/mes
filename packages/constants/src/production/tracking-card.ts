export const PRODUCTION_TRACKING_CARD_STATUSES = [
  'unused',
  'in_progress',
  'completed',
  'voided',
] as const;
export const PRODUCTION_TRACKING_CARD_STATUS_LABELS = {
  unused: '未使用',
  in_progress: '流转中',
  completed: '已确认产出',
  voided: '已作废',
} as const;
export const PRODUCTION_TRACKING_ABNORMALITY_SEVERITIES = ['normal', 'pause'] as const;
export const PRODUCTION_TRACKING_ABNORMALITY_SEVERITY_LABELS = {
  normal: '普通异常',
  pause: '暂停流转',
} as const;
export const PRODUCTION_TRACKING_ABNORMALITY_STATUSES = ['open', 'resolved'] as const;
export const PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS = {
  open: '待处理',
  resolved: '已处理',
} as const;
