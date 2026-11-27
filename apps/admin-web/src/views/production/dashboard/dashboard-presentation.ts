import type { ProductionDashboardScheduleItem } from '@company/contracts';
import { batchStatusMeta } from '../shared/production-status';
import { deadlinePresentation } from '../shared/production-task-presentation';
export const dayMilliseconds = 86400000;
export function beijingDate(value = Date.now()): string {
  return new Date(value + 8 * 3600000).toISOString().slice(0, 10);
}
export function dateValue(value: string): number {
  return Date.parse(value.slice(0, 10) + 'T00:00:00+08:00');
}
export function shiftDate(date: string, days: number): string {
  return beijingDate(dateValue(date) + days * dayMilliseconds);
}
export function quantity(value: string | number): string {
  return BigInt(value).toLocaleString('zh-CN');
}
export function taskStatus(item: ProductionDashboardScheduleItem): string {
  return item.status ? batchStatusMeta(item.status).label : '未建任务';
}
export function taskScheduleDelay(
  item: ProductionDashboardScheduleItem,
  now: number,
): { label: string; overdueFrom: number } | undefined {
  if (!item.status || item.status === 'cancelled' || !item.planEndDate) return;

  const finished = item.status === 'completed';
  const through = finished ? Date.parse(item.endedAt ?? '') : now;
  if (!Number.isFinite(through)) return;

  const { overdueDays } = deadlinePresentation(item.planEndDate, false, new Date(through));
  if (overdueDays > 0) {
    return {
      label: `${finished ? '延期结束' : '延期'} ${overdueDays} 天`,
      overdueFrom: dateValue(item.planEndDate) + dayMilliseconds,
    };
  }
}
export function dwell(arrival: string | null, asOf: string): string {
  if (!arrival) return '暂无到站记录';
  const minutes = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(arrival)) / 60000));
  if (minutes < 60) return `${minutes}分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时${minutes % 60}分`;
  return `${Math.floor(minutes / 1440)}天${Math.floor((minutes % 1440) / 60)}小时`;
}
