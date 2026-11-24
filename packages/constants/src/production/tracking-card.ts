export const PRODUCTION_TRACKING_CARD_BATCH_LIMIT = 100;
export const PRODUCTION_TRACKING_ITEM_MARK_MAX_LENGTH = 32;
export const PRODUCTION_TRACKING_MARK_AVAILABILITY_BATCH_SIZE = 200;
export const PRODUCTION_TRACKING_ITEM_MARK_STATUSES = ['active', 'scrapped', 'cancelled'] as const;
export const PRODUCTION_TRACKING_ITEM_MARK_STATUS_LABELS = {
  active: '正常',
  scrapped: '已报废',
  cancelled: '已撤销',
} as const;
export const PRODUCTION_TRACKING_ABNORMALITY_LABEL_LIMIT = 20;
export const PRODUCTION_TRACKING_MARK_WORKSPACE_STATUSES = ['active', 'scrapped'] as const;
export const PRODUCTION_TRACKING_ABNORMALITY_LABEL_MAX_LENGTH = 5000;
export const PRODUCTION_TRACKING_ABNORMALITY_RESOLUTIONS = ['repair', 'scrap'] as const;
export const PRODUCTION_TRACKING_ABNORMALITY_RESOLUTION_LABELS = {
  repair: '返修',
  scrap: '报废',
} as const;
export const PRODUCTION_TRACKING_ABNORMALITY_SCRAP_MODES = [
  'quantity_only',
  'optional_marks',
  'item_marked',
  'unknown',
] as const;

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
