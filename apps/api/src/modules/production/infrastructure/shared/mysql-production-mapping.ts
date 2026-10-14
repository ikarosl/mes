import { beijingWallDateTimeToISOString } from '@company/utils';
import { toBeijingISOString } from '../../../../common/time/date-time.js';

/** MySQL DATETIME strings, when supplied, are Beijing wall times. */
export const nullableBeijingDateTime = (value: Date | string | null): string | null => {
  if (value === null) return null;
  if (value instanceof Date) return toBeijingISOString(value);
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? toBeijingISOString(value)
    : beijingWallDateTimeToISOString(value);
};
