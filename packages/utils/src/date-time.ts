const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONED_INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i;
const BEIJING_WALL_DATETIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ]((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/;

export type InstantInput = Date | number | string;

/** Validate a calendar date without interpreting it as an instant. */
export const normalizeDateOnly = (value: string): string => {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new RangeError('Expected a date in YYYY-MM-DD format');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]!) {
    throw new RangeError('Invalid calendar date');
  }
  return value;
};

const instantTimestamp = (value: InstantInput): number => {
  if (typeof value === 'string') {
    const match = ZONED_INSTANT_PATTERN.exec(value);
    if (!match) throw new RangeError('Expected an ISO date-time with an explicit offset');
    normalizeDateOnly(match[1]!);
  }
  const timestamp =
    typeof value === 'number' ? value : value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new RangeError('Invalid instant');
  return timestamp;
};

/** Express an instant in Beijing time without changing the instant. */
export const toBeijingISOString = (value: InstantInput): string =>
  new Date(instantTimestamp(value) + BEIJING_OFFSET_MS).toISOString().replace('Z', '+08:00');

export const toBeijingCompactTimestamp = (value: InstantInput): string =>
  toBeijingISOString(value).slice(0, 19).replace(/[-:T]/g, '');

export const toBeijingDateString = (value: InstantInput): string =>
  toBeijingISOString(value).slice(0, 10);

export const formatBeijingDateTime = (value: InstantInput): string =>
  toBeijingISOString(value).slice(0, 19).replace('T', ' ');

/** Value for a datetime-local control, interpreted as a Beijing wall time. */
export const toBeijingDateTimeLocalString = (value: InstantInput): string =>
  toBeijingISOString(value).slice(0, 19);

/** Interpret an unzoned control value as Beijing wall time, then return an explicit offset. */
export const beijingWallDateTimeToISOString = (value: string): string => {
  const match = BEIJING_WALL_DATETIME_PATTERN.exec(value);
  if (!match) throw new RangeError('Expected a Beijing wall date-time');
  const date = normalizeDateOnly(match[1]!);
  const seconds = match[3] ?? '00';
  const milliseconds = (match[4] ?? '').padEnd(3, '0');
  return toBeijingISOString(`${date}T${match[2]}:${seconds}.${milliseconds}+08:00`);
};
