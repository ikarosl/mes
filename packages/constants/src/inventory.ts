export const OTHER_INVENTORY_DIRECTIONS = ['inbound', 'outbound'] as const;
export const OTHER_INVENTORY_DIRECTION_LABELS = {
  inbound: '其他入库',
  outbound: '其他出库',
} as const;
export const OTHER_INVENTORY_ORDER_STATUSES = [
  'pending',
  'pending_picking',
  'completed',
  'cancelled',
] as const;
export const OTHER_INVENTORY_STATUS_LABELS = {
  pending: '草稿／待确认',
  pending_picking: '草稿／待确认',
  completed: '已确认',
  cancelled: '已取消',
} as const;
export const INVENTORY_TARGET_MODES = ['new', 'existing'] as const;
export const INVENTORY_TARGET_MODE_LABELS = { new: '新建批次', existing: '已有批次' } as const;
