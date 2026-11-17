export const PROCUREMENT_RECEIPT_MAX_LINES = 100;
export const PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH = 2000;
export const RECEIPT_INBOUND_STATUS_LABELS = { open: '未结束入库', closed: '已结束入库' } as const;
export const RECEIPT_INBOUND_STATUS_ACTION_LABELS = {
  open: '结束入库',
  closed: '恢复入库',
} as const;
export const RECEIPT_HISTORY_KINDS = ['handlings', 'inbounds'] as const;
export const PURCHASE_FULFILLMENT_MODE_LABELS = {
  new_arrival: '等待新到货',
  existing_receipt: '已有到货补购',
} as const;
export const RECEIPT_LINE_STAGE_LABELS = {
  registered: '已登记',
  handled: '已有仓库记录',
  voided: '已作废',
} as const;
