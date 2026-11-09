import { beijingTodayUtc } from '../../../utils/date';
import type { WorkOrderType } from '@company/contracts';

const TASK_TYPE_TAG_TYPES: Record<WorkOrderType, 'primary' | 'warning'> = {
  mass_production: 'primary',
  research: 'warning',
};

export const taskTypeTagType = (orderType: WorkOrderType): 'primary' | 'warning' =>
  TASK_TYPE_TAG_TYPES[orderType];

export interface DeadlinePresentation {
  label: string;
  overdueDays: number;
  tone: 'muted' | 'normal' | 'warning';
}

const dateUtc = (value: string | null): number | null => {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return year && month && day ? Date.UTC(year, month - 1, day) : null;
};

export const deadlinePresentation = (
  planEndDate: string | null,
  terminal: boolean,
  now = new Date(),
): DeadlinePresentation => {
  const deadline = dateUtc(planEndDate);
  if (deadline === null) return { label: '未设置', overdueDays: 0, tone: 'muted' };
  if (terminal) return { label: '已结束', overdueDays: 0, tone: 'muted' };

  const difference = Math.floor((deadline - beijingTodayUtc(now)) / 86_400_000);
  if (difference < 0) {
    return {
      label: `已逾期 ${Math.abs(difference)} 天`,
      overdueDays: Math.abs(difference),
      tone: 'warning',
    };
  }
  if (difference === 0) return { label: '今天到期', overdueDays: 0, tone: 'warning' };
  return { label: `剩余 ${difference} 天`, overdueDays: 0, tone: 'normal' };
};
