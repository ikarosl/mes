export const RECEIPT_SCOPE_DISPOSITIONS = [
  'uninspected',
  'reviewing',
  'approved',
  'quality_return',
  'termination_return',
  'inbounded',
  'returned',
  'superseded',
] as const;
export const RECEIPT_SCOPE_DISPOSITION_LABELS = {
  uninspected: '待检',
  reviewing: '复核中',
  approved: '批准待入库',
  quality_return: '质量待退回',
  termination_return: '采购终止待退回',
  inbounded: '已入库',
  returned: '已退回供应商',
  superseded: '历史范围',
} as const;
export const SUPPLIER_RETURN_REASON_LABELS = {
  quality: '质量退回',
  procurement_termination: '采购终止退回',
} as const;
export const RECEIPT_HISTORY_KINDS = [
  'revisions',
  'scopes',
  'cases',
  'returns',
  'inbounds',
] as const;
