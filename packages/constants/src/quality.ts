export const QUALITY_INSPECTION_METHOD_LABELS = {
  full: '全检',
  sampling: '抽检',
} as const;
export const QUALITY_INBOUND_METHODS = ['full', 'sampling'] as const;
export const QUALITY_INBOUND_TEXT_MAX_LENGTH = 4000;
export const QUALITY_INCOMING_INSPECTION_REPORT_HEADER_MAX_LENGTH = 2000;
export const QUALITY_INCOMING_INSPECTION_REPORT_BATCH_MAX_LENGTH = 120;
export const QUALITY_INCOMING_INSPECTION_REPORT_TITLE = '进料检验报告';
export const QUALITY_INCOMING_INSPECTION_REPORT_COLUMN_LABELS = {
  inspectionItem: '检验项目',
  acceptanceRequirement: '验收要求',
  inspectionTool: '检验工具',
  contentDescription: '检验内容描述',
  inspectionResult: '检验结果',
} as const;
export const QUALITY_INCOMING_INSPECTION_REPORT_DEFAULT_ITEMS = [
  '外观',
  '包装要求',
  '材料证明',
  '数量',
] as const;
export const QUALITY_INCOMING_INSPECTION_REPORT_SIGNATURE_LABELS = [
  '编制',
  '审核',
  '批准',
] as const;
/** 单次分组命令的到货数量上限，不限制主单累计关联数。 */
export const QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS = 100;
export const QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH = 500;
export const QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATIONS = [
  'unassigned',
  'assigned',
  'all',
] as const;
export const QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATION_LABELS = {
  unassigned: '未关联到货',
  assigned: '已关联到货',
  all: '全部到货',
} as const;
