export const SUPPLIER_RETURN_REASON_LABELS = {
  quality: '质量退回',
  excess: '超发退回',
  procurement_termination: '采购终止退回',
  manual_rejection: '人工拒收退回',
} as const;
export const RECEIPT_HISTORY_KINDS = [
  'rounds',
  'revisions',
  'allocations',
  'cases',
  'returns',
  'inbounds',
  'acceptances',
] as const;

export const RECEIPT_ALLOCATION_DISPOSITIONS = ['inbound', 'return', 'pending'] as const;
export const RECEIPT_ALLOCATION_DISPOSITION_LABELS = {
  inbound: '可入库',
  return: '待退回',
  pending: '待处理',
} as const;
/** 分配事实记录当时的授权去向，不代表当前仍有执行余量。 */
export const RECEIPT_ALLOCATION_AUTHORIZATION_LABELS = {
  inbound: '授权入库',
  return: '安排退回',
  pending: '暂待处理',
} as const;
/** 根据当前轮次和实际物流数量生成的展示结果，不是持久化业务状态。 */
export const RECEIPT_ALLOCATION_EXECUTION_LABELS = {
  pending_inbound: '待入库',
  partially_inbound: '部分入库',
  inbound_completed: '已入库',
  pending_return: '待退回',
  partially_returned: '部分退回',
  return_completed: '已退回',
  pending: '待处理',
  superseded: '授权已失效',
  blocked: '暂不可执行',
} as const;
export const RECEIPT_RETURN_REASONS = [
  'quality',
  'excess',
  'procurement_termination',
  'manual_rejection',
] as const;
export const PURCHASE_FULFILLMENT_MODES = ['new_arrival', 'existing_receipt'] as const;
export const PURCHASE_FULFILLMENT_MODE_LABELS = {
  new_arrival: '等待新到货',
  existing_receipt: '承接已到货',
} as const;

export const RECEIPT_ROUND_STATUSES = [
  'uninspected',
  'reviewing',
  'reinspection_required',
  'quality_rejected',
  'awaiting_acceptance',
  'finalized',
  'superseded',
] as const;
export const RECEIPT_ROUND_STATUS_LABELS = {
  uninspected: '待检验',
  reviewing: '检验中',
  reinspection_required: '待复检',
  quality_rejected: '质检不放行',
  awaiting_acceptance: '待核对定稿',
  finalized: '已定稿',
  superseded: '历史轮次',
} as const;
export const RECEIPT_ROUND_TRIGGERS = [
  'receipt',
  'receipt_correction',
  'review',
  'acceptance_correction',
  'manual_rejection',
  'rejection_revocation',
] as const;
export const RECEIPT_ROUND_TRIGGER_LABELS = {
  rejection_revocation: '撤销拒收',
  receipt: '首次到货',
  receipt_correction: '实收更正',
  review: '整批复检',
  acceptance_correction: '分配更正',
  manual_rejection: '人工拒收',
} as const;
