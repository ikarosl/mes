import {
  beijingWallDateTimeToISOString,
  formatBeijingDateTime,
  normalizeDateOnly,
  toBeijingDateTimeLocalString,
  toBeijingDateString,
} from '@company/utils';

/** 业务日期是日历日；不按浏览器时区移动日期。 */
export function toDateInputValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  try {
    return normalizeDateOnly(trimmed.slice(0, 10));
  } catch {
    return '';
  }
}

export function formatDateForDisplay(value: string | null | undefined, fallback = '-'): string {
  return toDateInputValue(value) || fallback;
}

/** API 的带偏移时刻统一按北京时间显示。 */
export function formatDateTimeForDisplay(value: string | null | undefined, fallback = '-'): string {
  if (!value?.trim()) return fallback;
  try {
    return formatBeijingDateTime(value);
  } catch {
    return fallback;
  }
}

/** 日期时间控件只接收北京时间墙上时间，不让浏览器本地时区参与协议值。 */
export function toBeijingDateTimeInputValue(value: string | null | undefined): string {
  if (!value?.trim()) return '';
  try {
    return toBeijingDateTimeLocalString(value).replace('T', ' ');
  } catch {
    return '';
  }
}

/** 日期时间控件的墙上时间以北京时间 +08:00 序列化。 */
export function fromBeijingDateTimeInputValue(value: string | null | undefined): string {
  return value ? beijingWallDateTimeToISOString(value) : '';
}

/** 将北京时间的当前日历日映射为 UTC 日序数，供纯日期差值计算。 */
export function beijingTodayUtc(now: Date = new Date()): number {
  const today = toBeijingDateString(now);
  return Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
}
