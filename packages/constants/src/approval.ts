export const APPROVAL_SCENE_CODES = {
  bom: 'product.bom.approve',
  demandCorrection: 'production.demand.correct',
  batchCloseout: 'production.batch.closeout',
} as const;

export const APPROVAL_SCENE_LABELS: Readonly<Record<string, string>> = {
  [APPROVAL_SCENE_CODES.bom]: 'BOM 审批',
  [APPROVAL_SCENE_CODES.demandCorrection]: '需求更正与关闭',
  [APPROVAL_SCENE_CODES.batchCloseout]: '短产 / 提前结束批次',
};
export const APPROVAL_FLOW_VERSION_STATUSES = ['draft', 'published', 'discarded'] as const;
export const APPROVAL_INSTANCE_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export const APPROVAL_STEP_STATUSES = [
  'waiting',
  'pending',
  'blocked',
  'approved',
  'rejected',
  'cancelled',
] as const;
export const APPROVAL_ACTION_TYPES = [
  'submitted',
  'approved',
  'rejected',
  'withdrawn',
  'assignment_blocked',
  'reassigned',
] as const;
export const APPROVAL_LIST_SCOPES = ['todo', 'mine', 'all'] as const;
export const APPROVAL_BLOCKED_REASONS = ['no_eligible_assignee'] as const;
export const APPROVAL_SUBJECT_TYPES = [
  'product',
  'production_demand_correction',
  'production_batch_closeout',
] as const;
export const APPROVAL_INSTANCE_STATUS_LABELS = {
  pending: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
} as const;
export const APPROVAL_STEP_STATUS_LABELS = {
  waiting: '未开始',
  pending: '待审批',
  blocked: '暂无合格审批人',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已结束',
} as const;
export const APPROVAL_ASSIGNEE_TYPES = ['role', 'user'] as const;
export const APPROVAL_ASSIGNEE_TYPE = { role: 'role', user: 'user' } as const;
export const APPROVAL_ASSIGNEE_TYPE_LABELS = { role: '角色', user: '指定用户' } as const;
export const APPROVAL_ACTION_TYPE_LABELS = {
  submitted: '提交申请',
  approved: '节点通过',
  rejected: '驳回申请',
  withdrawn: '撤回申请',
  assignment_blocked: '人员分派阻塞',
  reassigned: '重新分派',
} as const;
export const APPROVAL_FLOW_VERSION_STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  discarded: '已废弃',
} as const;
