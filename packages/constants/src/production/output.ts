export const PRODUCTION_OUTPUT_STATUSES = [
  'pending_inbound',
  'inbounded',
  'cancelled',
  'no_inbound_required',
] as const;

export const PRODUCTION_OUTPUT_STATUS_LABELS = {
  pending_inbound: '待入库',
  inbounded: '已入库',
  cancelled: '已撤销',
  no_inbound_required: '零产出无需入库',
} as const;

export const PRODUCTION_TASK_FINISH_MODES = ['normal', 'early'] as const;
export const PRODUCTION_TASK_FINISH_MODE_LABELS = {
  normal: '正常结束',
  early: '提前结束',
} as const;
