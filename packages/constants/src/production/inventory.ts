export const INVENTORY_SOURCE_TYPES = [
  'self_made',
  'purchased',
  'outsourced',
  'return_inbound',
  'stock_check_generated',
  'other',
] as const;

export const INVENTORY_BATCH_STATUSES = ['available', 'frozen', 'disabled'] as const;

export const STOCK_STATUSES = ['available', 'pending_inspection', 'frozen', 'defective'] as const;

export const INVENTORY_TRANSACTION_TYPES = [
  'purchase_inbound',
  'production_inbound',
  'outsourced_inbound',
  'production_material_outbound',
  'sales_outbound',
  'material_return_inbound',
  'scrap_outbound',
  'stock_check_adjustment',
  'status_transfer_in',
  'status_transfer_out',
] as const;

export const INVENTORY_REFERENCE_TYPES = [
  'inbound_detail',
  'outbound_detail',
  'return_detail',
  'scrap',
  'stock_check_detail',
  'inspection_record',
  'manual',
] as const;

export const INVENTORY_TRANSACTION_TYPE_LABELS = {
  purchase_inbound: '外购入库',
  production_inbound: '生产入库',
  outsourced_inbound: '委外入库',
  production_material_outbound: '生产领料出库',
  sales_outbound: '销售出库',
  material_return_inbound: '生产退料入库',
  scrap_outbound: '报废出库',
  stock_check_adjustment: '盘点差异调整',
  status_transfer_in: '库存状态转入',
  status_transfer_out: '库存状态转出',
} as const satisfies Record<(typeof INVENTORY_TRANSACTION_TYPES)[number], string>;

export const INVENTORY_REFERENCE_TYPE_LABELS = {
  inbound_detail: '入库明细',
  outbound_detail: '出库明细',
  return_detail: '退料明细',
  scrap: '报废记录',
  stock_check_detail: '盘点明细',
  inspection_record: '检验记录',
  manual: '手工调整',
} as const satisfies Record<(typeof INVENTORY_REFERENCE_TYPES)[number], string>;

export const INBOUND_ORDER_STATUSES = ['pending', 'completed', 'cancelled'] as const;

export const RETURN_ORDER_STATUSES = ['pending', 'returned', 'scrapped', 'cancelled'] as const;

export const RETURN_ORDER_STATUS_LABELS = {
  pending: '待退料',
  returned: '已入库',
  scrapped: '已报废',
  cancelled: '已取消',
} as const;

export const SCRAP_SCENES = [
  'warehouse_allocated',
  'return_after_outbound',
  'production_consumed',
  'in_stock',
] as const;

export const SCRAP_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;

export const STOCK_CHECK_STATUSES = ['pending', 'counting', 'completed', 'cancelled'] as const;

export const STOCK_CHECK_RESULTS = ['surplus', 'shortage', 'matched'] as const;

export const STOCK_CHECK_STATUS_LABELS = {
  pending: '待盘点',
  counting: '盘点中',
  completed: '已完成',
  cancelled: '已取消',
} as const;

export const STOCK_CHECK_RESULT_LABELS = {
  surplus: '盘盈',
  shortage: '盘亏',
  matched: '一致',
} as const;

export const INSPECTION_TYPES = ['process', 'final'] as const;

export const INSPECTION_RESULTS = ['pending', 'passed', 'failed', 'conditional'] as const;

export const REWORK_RESULTS = ['pending', 'passed', 'failed'] as const;

export const FINISHED_FLOW_TYPES = [
  'warehouse_inbound',
  'quality_release',
  'warehouse_outbound',
  'other',
] as const;

export const FINISHED_FLOW_STATUSES = ['confirmed', 'cancelled'] as const;
