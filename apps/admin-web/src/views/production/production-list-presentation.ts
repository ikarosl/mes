import type { ProductionBatchStatus, WorkOrderItem } from '@company/contracts';
import type { StatusTagType } from './production-status';

export interface DeadlinePresentation {
  label: string;
  overdueDays: number;
  tone: 'muted' | 'normal' | 'warning';
}

const beijingTodayUtc = (now = new Date()): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(value('year'), value('month') - 1, value('day'));
};

const dateUtc = (value: string | null): number | null => {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return year && month && day ? Date.UTC(year, month - 1, day) : null;
};

export const quantityProgressPercentage = (
  completed: string | number,
  total: string | number,
): number => {
  const completedNumber = Number(completed);
  const totalNumber = Number(total);
  if (!Number.isFinite(completedNumber) || !Number.isFinite(totalNumber) || totalNumber <= 0)
    return 0;
  return Math.min(100, Math.max(0, Math.round((completedNumber / totalNumber) * 100)));
};

export const deadlinePresentation = (
  planEndDate: string | null,
  terminal: boolean,
  now = new Date(),
): DeadlinePresentation => {
  const deadline = dateUtc(planEndDate);
  if (deadline === null) return { label: '未设置', overdueDays: 0, tone: 'muted' };
  if (terminal) return { label: '已结束', overdueDays: 0, tone: 'muted' };

  const dayDifference = Math.floor((deadline - beijingTodayUtc(now)) / 86_400_000);
  if (dayDifference < 0) {
    return {
      label: `已逾期 ${Math.abs(dayDifference)} 天`,
      overdueDays: Math.abs(dayDifference),
      tone: 'warning',
    };
  }
  if (dayDifference === 0) return { label: '今天到期', overdueDays: 0, tone: 'warning' };
  return { label: `剩余 ${dayDifference} 天`, overdueDays: 0, tone: 'normal' };
};

export const workOrderIsTerminal = (status: WorkOrderItem['status']): boolean =>
  ['completed', 'closed', 'cancelled'].includes(status);

export const workOrderNextAction = (order: WorkOrderItem): string => {
  if (order.status === 'draft') return '待下达';
  if (order.status === 'released') {
    const remaining = Math.max(Number(order.plannedQuantity) - Number(order.assignedQuantity), 0);
    return remaining > 0 ? '待创建生产批次' : '批次已分配';
  }
  if (order.status === 'doing') return '跟进生产批次';
  if (order.status === 'completed') return '待关闭工单';
  if (order.status === 'closed') return '已关闭';
  return '已取消';
};

export const batchIsTerminal = (status: ProductionBatchStatus): boolean =>
  status === 'completed' || status === 'cancelled';

export const batchMaterialStage = (
  status: ProductionBatchStatus,
): { label: string; type: StatusTagType } => {
  if (status === 'pending') return { label: '待生成需求', type: 'info' };
  if (status === 'material_pending') return { label: '待分配', type: 'warning' };
  if (status === 'material_assigned') return { label: '已预留', type: 'primary' };
  if (status === 'cancelled') return { label: '已取消', type: 'info' };
  return { label: '已领料', type: 'success' };
};
