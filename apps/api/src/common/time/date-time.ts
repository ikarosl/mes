const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 按项目公开的 Asia/Shanghai 时间戳表示格式化时刻。 */
export const toBeijingISOString = (value: Date | number) => {
  const timestamp = typeof value === 'number' ? value : value.getTime();
  return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().replace('Z', '+08:00');
};

/** 在不改变所表示时刻的前提下，格式化人类可读的时间戳。 */
export const toBeijingCompactTimestamp = (value: Date | number) =>
  toBeijingISOString(value).slice(0, 19).replace(/[-:T]/g, '');

/** 将数据库 DATE 值格式化为项目约定的纯日期 API 表示。 */
export const toDateOnlyString = (value: Date | string | null): string | null => {
  if (value === null) return null;
  return (typeof value === 'string' ? value : toBeijingISOString(value)).slice(0, 10);
};
