export const PRODUCTION_TRACKING_CARD_BATCH_LIMIT = 100;

export const PRODUCTION_TRACKING_CARD_STATUSES = [
  'unused',
  'in_progress',
  'completed',
  'scrapped',
  'voided',
] as const;
export const PRODUCTION_TRACKING_CARD_STATUS_LABELS = {
  unused: '未使用',
  in_progress: '流转中',
  completed: '已确认产出',
  scrapped: '整盘报废',
  voided: '已作废',
} as const;
export const PRODUCTION_TRACKING_ABNORMALITY_STATUSES = ['open', 'resolved'] as const;
export const PRODUCTION_TRACKING_ABNORMALITY_STATUS_LABELS = {
  open: '待处理',
  resolved: '已处理',
} as const;
