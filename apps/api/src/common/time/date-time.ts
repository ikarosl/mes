import { normalizeDateOnly, toBeijingDateString } from '@company/utils';

export { toBeijingCompactTimestamp, toBeijingISOString } from '@company/utils';

/** Adapt a MySQL DATE result while keeping calendar dates free of timezone conversion. */
export const toDateOnlyString = (value: Date | string | null): string | null => {
  if (value === null) return null;
  if (value instanceof Date) return toBeijingDateString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? normalizeDateOnly(value) : toBeijingDateString(value);
};
