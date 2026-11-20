export const TRACKING_ITEM_MARK_CODE_PATTERN = /^[1-9][0-9]{0,31}$/;
export const TRACKING_ITEM_MARK_CODE_ERROR_MESSAGE =
  '单件刻码须为大于 0 的整数，最多 32 位，不保留前导零';

/** Keep digit precision; invalid input is left intact for the caller's validation. */
export function normalizeTrackingItemMarkCode(value: string): string {
  return /^[0-9]{1,32}$/.test(value) ? value.replace(/^0+(?=\d)/, '') : value;
}

export function isValidTrackingItemMarkCode(value: string): boolean {
  return TRACKING_ITEM_MARK_CODE_PATTERN.test(normalizeTrackingItemMarkCode(value));
}
