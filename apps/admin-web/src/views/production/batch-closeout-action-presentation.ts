import type { BatchCloseoutAction } from '@company/contracts';
import {
  BATCH_CLOSEOUT_STATUS_LABELS,
  BATCH_TERMINATION_IMPACT_LABELS,
  PRODUCTION_TASK_CLOSEOUT_ACTION_LABELS,
} from '@company/constants';
import { BATCH_STATUS_META } from './production-status';

export function batchCloseoutActionLabel(action: BatchCloseoutAction): string {
  if (action.kind === 'task')
    return action.actionType
      ? PRODUCTION_TASK_CLOSEOUT_ACTION_LABELS[action.actionType]
      : '任务行动';
  return BATCH_TERMINATION_IMPACT_LABELS[action.kind];
}

export function batchCloseoutActionStatusLabel(kind: string, status: string): string {
  return kind === 'task'
    ? (BATCH_STATUS_META.find((entry) => entry.value === status)?.label ?? '未知任务阶段')
    : (BATCH_CLOSEOUT_STATUS_LABELS[kind]?.[status] ?? '未知状态');
}
