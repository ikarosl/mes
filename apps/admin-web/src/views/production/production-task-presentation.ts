export interface DeadlinePresentation {
  label: string;
  overdueDays: number;
  tone: 'muted' | 'normal' | 'warning';
}

export interface TaskNextActionPresentation {
  label: string;
  tone: 'muted' | 'warning' | 'primary' | 'success';
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

export const taskNextActionPresentation = (batch: {
  status:
    | 'pending'
    | 'material_pending'
    | 'material_assigned'
    | 'material_partially_outbound'
    | 'material_outbound'
    | 'doing'
    | 'completed'
    | 'cancelled';
  hasActiveMaterialOutbound?: boolean;
}): TaskNextActionPresentation => {
  if (batch.status === 'cancelled') return { label: '任务已取消', tone: 'muted' };
  if (batch.status === 'material_partially_outbound')
    return { label: '短批已部分领料', tone: 'warning' };
  if (
    batch.hasActiveMaterialOutbound ||
    !['pending', 'material_pending', 'material_assigned'].includes(batch.status)
  ) {
    return { label: '物料操作已完成', tone: 'success' };
  }
  if (batch.status === 'pending') return { label: '待配置物料需求', tone: 'warning' };
  if (batch.status === 'material_pending') return { label: '待完成物料分配', tone: 'warning' };
  return { label: '待创建领料出库单', tone: 'primary' };
};
