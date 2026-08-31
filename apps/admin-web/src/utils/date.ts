const DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/;

/**
 * 将 API 日期时间字符串转换为日期输入框所需的纯日期值。
 * 有意避免解析 Date，防止 ISO 偏移量导致日期发生跨日变化。
 */
export function toDateInputValue(value: string | null | undefined): string {
  const normalizedValue = value?.trim();
  return normalizedValue && DATE_PREFIX_PATTERN.test(normalizedValue)
    ? normalizedValue.slice(0, 10)
    : '';
}

/** 将 API 日期时间值格式化为日期业务字段所需的显示值。 */
export function formatDateForDisplay(value: string | null | undefined, fallback = '-'): string {
  return toDateInputValue(value) || fallback;
}

/**
 * 将 API 日期时间值格式化为审计记录及其他需要体现具体时刻的字段所需的
 * “YYYY-MM-DD HH:mm:ss”格式。
 */
export function formatDateTimeForDisplay(value: string | null | undefined, fallback = '-'): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const match = DATETIME_PATTERN.exec(trimmed);
  return match ? `${match[1]} ${match[2]}` : fallback;
}
