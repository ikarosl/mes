export const PRODUCTION_DASHBOARD_OPTION_KINDS = ['work-orders', 'tasks', 'products'] as const;
export const PRODUCTION_DASHBOARD_OUTPUT_GROUPS = ['task', 'day'] as const;
export const PRODUCTION_DASHBOARD_ABNORMALITY_GROUPS = ['reason', 'step'] as const;
export const PRODUCTION_DASHBOARD_OUTPUT_LABELS = { task: '按任务', day: '按日' } as const;
export const PRODUCTION_DASHBOARD_ABNORMALITY_LABELS = {
  reason: '按原因',
  step: '按工序',
} as const;
export const PRODUCTION_DASHBOARD_MODULES = [
  'schedule',
  'flow',
  'output',
  'abnormalities',
] as const;
export const PRODUCTION_DASHBOARD_MODULE_LABELS = {
  schedule: '工单 / 任务排期',
  flow: '工序流转',
  output: '产出数量对比',
  abnormalities: '异常原因排行',
} as const;
export const PRODUCTION_DASHBOARD_MAX_DAYS = 366;
export const PRODUCTION_DASHBOARD_FLOW_MODES = ['current', 'period'] as const;
export const PRODUCTION_DASHBOARD_FLOW_MODE_LABELS = {
  current: '当前在制',
  period: '期间流转',
} as const;
