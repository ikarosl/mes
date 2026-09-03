export const WORK_ORDER_STATUSES = [
  'draft',
  'released',
  'doing',
  'completed',
  'cancelled',
  'closed',
] as const;

export const PRODUCTION_BATCH_STATUSES = [
  'pending',
  'material_pending',
  'material_assigned',
  'material_partially_outbound',
  'material_outbound',
  'doing',
  'completed',
  'cancelled',
] as const;

export const BATCH_STEP_STATUSES = ['pending', 'assigned', 'doing', 'completed'] as const;

export const BATCH_STEP_STATUS_LABELS = {
  pending: '待派工',
  assigned: '已派工',
  doing: '进行中',
  completed: '已完成',
} as const;

export const BATCH_STEP_REPORT_TYPES = ['normal', 'reversal'] as const;

export const BATCH_STEP_REPORT_TYPE_LABELS = {
  normal: '普通报工',
  reversal: '冲销事实',
} as const;

export const BATCH_STEP_ABNORMAL_REVIEW_STATUSES = [
  'pending_review',
  'approved',
  'rejected',
  'cancelled',
] as const;

export const BATCH_STEP_ABNORMAL_DISPOSITION_TYPES = ['rework', 'scrap'] as const;

export const BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS = {
  pending_review: '待处置',
  approved: '已批准',
  rejected: '已驳回',
  cancelled: '已取消',
} as const;

export const REWORK_STATUSES = ['pending', 'doing', 'completed', 'cancelled'] as const;

export const PRODUCTION_SCRAP_SUPPLEMENT_PLAN_STATUSES = ['draft', 'confirmed'] as const;

export const REWORK_STATUS_LABELS = {
  pending: '待返工',
  doing: '返工中',
  completed: '已完成',
  cancelled: '已取消',
} as const;

export const PRODUCTION_EXECUTION_COMPLETION_BLOCKERS = [
  'batch_not_doing',
  'no_required_reporting_step',
  'required_step_incomplete',
  'final_step_quantity_insufficient',
] as const;

export const PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS = {
  batch_not_doing: '批次尚未进入生产执行状态',
  no_required_reporting_step: '批次没有必报工工序',
  required_step_incomplete: '仍有必报工工序未完成',
  final_step_quantity_insufficient: '最后一道必报工工序的有效正常数量尚未达到计划数量',
  active_material_demand_remains: '仍有未完成物料需求，请继续领料或显式关闭剩余需求',
} as const;

export const DEMAND_TYPES = [
  'normal',
  'manual_additional',
  'scrap_supplement',
  'material_loss_supplement',
] as const;

export const DEMAND_TYPE = {
  normal: DEMAND_TYPES[0],
  manualAdditional: DEMAND_TYPES[1],
  scrapSupplement: DEMAND_TYPES[2],
  materialLossSupplement: DEMAND_TYPES[3],
} as const;

/** 一次需求生成动作的类型；与该组内需求的 demand_type 保持一致。 */
export const DEMAND_GENERATION_GROUP_TYPES = DEMAND_TYPES;

export const DEMAND_GENERATION_GROUP_TYPE = {
  normal: DEMAND_TYPE.normal,
  manualAdditional: DEMAND_TYPE.manualAdditional,
  scrapSupplement: DEMAND_TYPE.scrapSupplement,
  materialLossSupplement: DEMAND_TYPE.materialLossSupplement,
} as const;

export const DEMAND_GENERATION_GROUP_TYPE_LABELS = {
  normal: '初始物料需求',
  manual_additional: '人工追加需求',
  scrap_supplement: '报废补料',
  material_loss_supplement: '损耗补料',
} as const;

export const DEMAND_BUSINESS_STATUSES = ['active', 'fulfilled', 'cancelled'] as const;

export const BATCH_STEP_ABNORMAL_ORIGINS = ['current_step', 'previous_step'] as const;

export const BATCH_STEP_ABNORMAL_ORIGIN_LABELS = {
  current_step: '本工序异常',
  previous_step: '前置异常',
} as const;

export const ALLOCATION_STATUSES = [
  'active',
  'released',
  'cancelled',
  'frozen',
  'abnormal',
] as const;

export const OUTBOUND_ORDER_STATUSES = [
  'pending_picking',
  'picked',
  'partially_outbound',
  'completed',
  'cancelled',
] as const;

export const ALLOCATION_STATUS_LABELS = {
  active: '有效',
  released: '已释放',
  cancelled: '已取消',
  frozen: '已冻结',
  abnormal: '异常',
} as const;

/** 单条生产物料需求的分配/出库展示进度，不包含需求持久化业务状态。 */
export const MATERIAL_DEMAND_PROGRESS_STATUSES = [
  'pending_allocation',
  'partially_allocated',
  'allocated',
  'shortage',
  'partially_outbound',
  'outbound',
  'cancelled',
] as const;

export const MATERIAL_DEMAND_PROGRESS_LABELS = {
  pending_allocation: '待分配',
  partially_allocated: '部分分配',
  allocated: '已分配',
  shortage: '短批缺料',
  partially_outbound: '部分出库',
  outbound: '已出库',
  cancelled: '已取消',
} as const;

export const OUTBOUND_ORDER_STATUS_LABELS = {
  pending_picking: '待出库',
  picked: '已拣货',
  partially_outbound: '部分出库',
  completed: '已出库',
  cancelled: '已取消',
} as const;

export const SHORT_BATCH_AUTHORIZATION_ACTIONS = [
  'authorize',
  'reauthorize',
  'adjust',
  'view',
  'not_required',
] as const;

export const SHORT_BATCH_AUTHORIZATION_ACTION_LABELS = {
  authorize: '短批授权',
  reauthorize: '重新短批授权',
  adjust: '调整短批授权',
  view: '查看短批授权',
  not_required: '物料已齐套',
} as const;

export const SHORT_BATCH_AUTHORIZATION_COVERAGES = [
  'none',
  'covered',
  'insufficient',
  'stale',
  'consumed',
] as const;

export const MATERIAL_OUTBOUND_MODES = ['normal', 'short_batch'] as const;

export const MATERIAL_OUTBOUND_BLOCKED_CODES = [
  'allocation_incomplete',
  'short_batch_authorization_required',
  'short_batch_authorization_stale',
  'no_orderable_allocation',
] as const;

export const MATERIAL_OUTBOUND_BLOCKED_LABELS = {
  allocation_incomplete: '物料尚未形成可制单分配，请先完成分配',
  short_batch_authorization_required: '物料尚未齐套，请先完成分配或办理短批授权',
  short_batch_authorization_stale: '需求计划已变化，请到生产任务重新复核短批授权',
  no_orderable_allocation: '暂无可制单分配，可能已被其他待出库单占用',
} as const;
