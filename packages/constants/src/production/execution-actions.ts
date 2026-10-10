export const PRODUCTION_STEP_EXECUTION_ACTION_TYPES = ['start', 'complete', 'reopen'] as const;

/** 历史动作值只用于读取，不开放历史更正命令。 */
export const PRODUCTION_STEP_EXECUTION_HISTORY_ACTION_TYPES = [
  'start',
  'complete',
  'reopen',
  'correct_history',
] as const;

export const PRODUCTION_STEP_EXECUTION_ACTION_LABELS = {
  start: '开始工序',
  complete: '明确完成',
  reopen: '重新打开',
} as const;

export const PRODUCTION_STEP_EXECUTION_HISTORY_LABELS = {
  ...PRODUCTION_STEP_EXECUTION_ACTION_LABELS,
  correct_history: '管理员状态历史更正',
  terminate: '逐项终止工序',
} as const;

/** 仅用于读取既有不可变历史。 */
export const PRODUCTION_STEP_HISTORY_CORRECTION_TYPES = [
  'undo_start',
  'complete',
  'reopen',
] as const;

export const PRODUCTION_STEP_HISTORY_CORRECTION_LABELS = {
  undo_start: '更正误点开工',
  complete: '更正为已完成',
  reopen: '更正为进行中',
} as const;
