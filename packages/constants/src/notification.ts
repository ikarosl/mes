export const NOTIFICATION_EVENT_TYPES = [
  'approval_task_assigned',
  'approval_approved',
  'approval_rejected',
  'approval_withdrawn',
  'system_notice',
] as const;
export const NOTIFICATION_SOURCE_TYPES = ['approval_action'] as const;
export const NOTIFICATION_TARGET_TYPES = ['approval_instance'] as const;
export const NOTIFICATION_READ_FILTERS = ['all', 'unread'] as const;
export const NOTIFICATION_READ_FILTER_LABELS = { all: '全部', unread: '未读' } as const;
export const NOTIFICATION_EVENT_LABELS = {
  approval_task_assigned: '审批待处理',
  approval_approved: '审批已通过',
  approval_rejected: '审批已驳回',
  approval_withdrawn: '审批已撤回',
  system_notice: '系统通知',
} as const;
