export const APPROVAL_SCENE_CODES = { bom: 'product.bom.approve' } as const;
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
export const APPROVAL_TASK_STATUSES = ['pending', 'approved', 'rejected', 'closed'] as const;
export const APPROVAL_TASK_CLOSE_REASONS = [
  'peer_decided',
  'instance_rejected',
  'instance_withdrawn',
  'reassigned',
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
export const APPROVAL_SUBJECT_TYPES = ['product'] as const;
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
export const APPROVAL_TASK_STATUS_LABELS = {
  pending: '待处理',
  approved: '已通过',
  rejected: '已驳回',
  closed: '已关闭',
} as const;
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
