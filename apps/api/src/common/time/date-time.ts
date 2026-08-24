const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Formats an instant using the project's public Asia/Shanghai timestamp representation. */
export const toBeijingISOString = (value: Date | number) => {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().replace('Z', '+08:00');
};

/** Formats a human-visible timestamp without changing the represented instant. */
export const toBeijingCompactTimestamp = (value: Date | number) =>
  toBeijingISOString(value).slice(0, 19).replace(/[-:T]/g, '');

/** Formats a database DATE value as the project's date-only API representation. */
export const toDateOnlyString = (value: Date | string | null): string | null => {
  if (value === null) return null;
  return (typeof value === 'string' ? value : toBeijingISOString(value)).slice(0, 10);
};
