export const WORK_ORDER_STATUSES = [
  'draft',
  'released',
  'doing',
  'completed',
  'cancelled',
  'closed',
] as const;

export const WORK_ORDER_TYPES = ['mass_production', 'research'] as const;

export const WORK_ORDER_TYPE_LABELS = {
  mass_production: '批量生产',
  research: '研发任务',
} as const;

export const PRODUCTION_BATCH_STATUSES = [
  'draft',
  'pending',
  'material_pending',
  'material_assigned',
  'material_partially_outbound',
  'material_outbound',
  'doing',
  'completed',
  'cancelled',
] as const;

export const DEMAND_TYPES = ['normal', 'manual_additional'] as const;

export const DEMAND_TYPE = {
  normal: DEMAND_TYPES[0],
  manualAdditional: DEMAND_TYPES[1],
} as const;

/** 一次需求生成动作的类型；与该组内需求的 demand_type 保持一致。 */
export const DEMAND_GENERATION_GROUP_TYPES = DEMAND_TYPES;

export const DEMAND_GENERATION_GROUP_TYPE = {
  normal: DEMAND_TYPE.normal,
  manualAdditional: DEMAND_TYPE.manualAdditional,
} as const;

export const DEMAND_GENERATION_GROUP_TYPE_LABELS = {
  normal: '初始物料需求',
  manual_additional: '人工追加需求',
} as const;

export const DEMAND_BUSINESS_STATUSES = ['active', 'fulfilled', 'cancelled', 'closed'] as const;
export const DEMAND_BUSINESS_STATUS_LABELS = {
  active: '待履约',
  fulfilled: '已领齐',
  cancelled: '已取消',
  closed: '已关闭',
} as const;
export const DEMAND_CLOSE_CAUSES = [
  'correction_replaced',
  'correction_exhausted',
  'single_close',
  'task_finished',
] as const;
export const DEMAND_CLOSE_CAUSE_LABELS = {
  correction_replaced: '纠错并替代',
  correction_exhausted: '更正后无剩余',
  single_close: '单条需求关闭',
  task_finished: '任务结束',
} as const;
export const DEMAND_CORRECTION_KINDS = ['quantity', 'close'] as const;
export const DEMAND_CORRECTION_KIND_LABELS = { quantity: '更正数量', close: '关闭剩余' } as const;
export const DEMAND_CORRECTION_STATE_LABELS = {
  draft: '未送审',
  pending: '更正审批中',
  applied: '已生效',
  ended: '审批已结束',
} as const;
export const ALLOCATION_STATUSES = [
  'active',
  'released',
  'cancelled',
  'frozen',
  'abnormal',
] as const;

export const OUTBOUND_ORDER_STATUSES = ['pending_picking', 'completed', 'cancelled'] as const;

export const ALLOCATION_STATUS_LABELS = {
  active: '有效',
  released: '已释放',
  cancelled: '已取消',
  frozen: '已冻结',
  abnormal: '异常',
} as const;

/** 单条生产物料需求的分配/出库展示进度，不包含需求持久化业务状态。 */
export const MATERIAL_DEMAND_PROGRESS_LABELS = {
  pending_allocation: '待分配',
  partially_allocated: '部分分配',
  allocated: '已分配',
  shortage: '领料缺口',
  partially_outbound: '部分出库',
  outbound: '已出库',
  cancelled: '已取消',
  closed: '已关闭',
  correction_pending: '更正审批中',
} as const;

export const OUTBOUND_ORDER_STATUS_LABELS = {
  pending_picking: '待出库',
  completed: '已出库',
  cancelled: '已取消',
} as const;

export const MATERIAL_OUTBOUND_BLOCKED_LABELS = {
  allocation_incomplete: '物料尚未形成可制单分配，请先完成分配',
  no_orderable_allocation: '暂无可制单分配，可能已被其他待出库单占用',
} as const;

export const WORK_ORDER_CLOSE_TYPE_LABELS = {
  unproduced: '未生产结案',
  underproduced: '不足量结案',
  completed_archive: '完工归档',
} as const;

export const PRODUCTION_OUTBOUND_CANCEL_SOURCE_LABELS = {
  manual: '人工取消',
  production_batch: '生产任务取消',
  production_termination: '任务结束',
} as const;
