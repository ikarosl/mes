const DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}/;

/**
 * Converts an API date/time string to the date-only value required by date inputs.
 * It deliberately avoids Date parsing so an ISO offset cannot move the calendar day.
 */
export function toDateInputValue(value: string | null | undefined): string {
  const normalizedValue = value?.trim();
  return normalizedValue && DATE_PREFIX_PATTERN.test(normalizedValue)
    ? normalizedValue.slice(0, 10)
    : '';
}

/** Formats an API date/time value for date-only business fields. */
export function formatDateForDisplay(value: string | null | undefined, fallback = '-'): string {
  return toDateInputValue(value) || fallback;
}
