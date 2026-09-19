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
  'pending',
  'material_pending',
  'material_assigned',
  'material_partially_outbound',
  'material_outbound',
  'doing',
  'completed',
  'cancelled',
  'terminated',
  'closing',
] as const;

export const BATCH_STEP_STATUSES = [
  'pending',
  'assigned',
  'doing',
  'completed',
  'terminated',
] as const;

export const BATCH_STEP_STATUS_LABELS = {
  pending: '待派工',
  assigned: '已派工',
  doing: '进行中',
  completed: '已完成',
  terminated: '已终止',
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
  'terminated',
] as const;

export const BATCH_STEP_ABNORMAL_DISPOSITION_TYPES = ['rework', 'scrap'] as const;

export const BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS = {
  pending_review: '待处置',
  approved: '已批准',
  rejected: '已驳回',
  cancelled: '已取消',
  terminated: '随批次结束',
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
  'no_route_step',
  'required_step_incomplete',
  'final_step_quantity_insufficient',
  'active_material_demand_remains',
  'unfulfilled_material_supplement',
] as const;

export const PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS = {
  batch_not_doing: '批次尚未进入生产执行状态',
  no_route_step: '批次没有工序',
  required_step_incomplete: '仍有工序未完成',
  final_step_quantity_insufficient: '最后一道工序的有效正常数量尚未达到计划数量',
  active_material_demand_remains: '仍有未完成物料需求，请继续领料、申请更正或办理批次收尾',
  unfulfilled_material_supplement: '仍有未齐套补料单，需完成有效需求或办理批次收尾',
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
  'batch_closeout',
] as const;
export const DEMAND_CLOSE_CAUSE_LABELS = {
  correction_replaced: '纠错并替代',
  correction_exhausted: '更正后无剩余',
  single_close: '单条需求关闭',
  batch_closeout: '批次收尾',
} as const;
export const DEMAND_CORRECTION_KINDS = ['quantity', 'close'] as const;
export const DEMAND_CORRECTION_KIND_LABELS = { quantity: '更正数量', close: '关闭剩余' } as const;
export const DEMAND_CORRECTION_STATE_LABELS = {
  draft: '未送审',
  pending: '更正审批中',
  applied: '已生效',
  ended: '审批已结束',
} as const;
export const BATCH_CLOSEOUT_ITEM_KINDS = [
  'step',
  'abnormal',
  'rework',
  'supplement',
  'outbound',
  'demand',
  'allocation',
  'material',
] as const;
export const PRODUCTION_CLOSING_LABEL = '收尾中';
export const BATCH_CLOSEOUT_MATERIAL_REVIEW_LABELS = {
  pending: '待核对',
  reviewed: '已核对',
  stale: '事实已变化，需重核',
} as const;
export const BATCH_CLOSEOUT_WORK_GROUPS = [
  {
    kind: 'outbound',
    module: '物流与需求',
    title: '1. 取消待出库单',
    reason: '本批次提前结束，取消未执行的领料出库；已确认领料记录保留。',
  },
  {
    kind: 'allocation',
    module: '物流与需求',
    title: '2. 释放分配',
    reason: '本批次提前结束，释放尚未出库的物料预留；保留实际领料记录。',
  },
  {
    kind: 'demand',
    module: '物流与需求',
    title: '3. 关闭剩余需求',
    reason: '本批次停止生产，关闭未履约的剩余需求；原需求数量和已领料记录保留。',
  },
  {
    kind: 'supplement',
    module: '物流与需求',
    title: '4. 取消未履约补料单',
    reason: '本批次停止生产，相关剩余需求已处理，取消未履约补料单，不放行新增补产额度。',
  },
  {
    kind: 'step',
    module: '工序',
    title: '终止未完成工序',
    reason: '本批次提前结束，终止后续工序执行；保留已发生的报工记录。',
  },
  {
    kind: 'abnormal',
    module: '异常与返工',
    title: '结束待处理异常',
    reason: '本批次停止生产，结束待处理异常；不由本次收尾生成补料或补产。',
  },
  {
    kind: 'rework',
    module: '异常与返工',
    title: '取消未完成返工',
    reason: '本批次提前结束，取消尚未完成的返工安排；保留已发生的执行记录。',
  },
] as const;

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
  'closed',
  'correction_pending',
] as const;

export const MATERIAL_DEMAND_PROGRESS_LABELS = {
  pending_allocation: '待分配',
  partially_allocated: '部分分配',
  allocated: '已分配',
  shortage: '短批缺料',
  partially_outbound: '部分出库',
  outbound: '已出库',
  cancelled: '已取消',
  closed: '已关闭',
  correction_pending: '更正审批中',
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

export const PRODUCTION_TERMINATED_LABEL = '已结束';
export const WORK_ORDER_CLOSE_TYPE_LABELS = {
  unproduced: '未生产结案',
  underproduced: '不足量结案',
  completed_archive: '完工归档',
  production_terminated: '结束生产结案',
} as const;
export const PRODUCTION_SUPPLEMENT_STATUS_LABELS = {
  approved: '待补料领用',
  fulfilled: '已补料领用',
  cancelled: '已取消补料',
} as const;
export const BATCH_TERMINATION_IMPACT_LABELS = {
  step: '停止工序',
  abnormal: '结束待处理异常',
  rework: '取消未完成返工',
  supplement: '取消未履约补料',
  outbound: '取消待领料出库单',
  demand: '关闭剩余需求',
  allocation: '释放剩余预留',
  material: '核对物料安排',
} as const;

export const BATCH_CLOSEOUT_STATUS_LABELS: Record<string, Readonly<Record<string, string>>> = {
  step: BATCH_STEP_STATUS_LABELS,
  abnormal: BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS,
  rework: REWORK_STATUS_LABELS,
  supplement: PRODUCTION_SUPPLEMENT_STATUS_LABELS,
  outbound: OUTBOUND_ORDER_STATUS_LABELS,
  demand: DEMAND_BUSINESS_STATUS_LABELS,
  allocation: ALLOCATION_STATUS_LABELS,
  material: { unreviewed: '待核对', reviewed: '已核对' },
};

export const PRODUCTION_OUTBOUND_CANCEL_SOURCE_LABELS = {
  manual: '人工取消',
  production_batch: '生产任务取消',
  production_termination: '本轮生产结束',
} as const;
