export const MAX_PERSISTED_INTEGER_QUANTITY = 99_999_999;

/**
 * 数量参与计算前必须是安全整数；每项业务的正负及上限由调用方校验。
 */
export const integerQuantity = (value: number | string): number => {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError('数量必须是安全整数');
  }
  return quantity;
};

/** 数量契约使用十进制整数字符串，不补小数位。 */
export const fixedIntegerQuantity = (value: number | string): string =>
  String(integerQuantity(value));

export const multiplyIntegerQuantities = (
  left: number | string,
  right: number | string,
): string => {
  const result = BigInt(integerQuantity(left)) * BigInt(integerQuantity(right));
  if (result < 0n || result > BigInt(MAX_PERSISTED_INTEGER_QUANTITY)) {
    throw new RangeError(`数量乘积超过允许上限 ${MAX_PERSISTED_INTEGER_QUANTITY}`);
  }
  return String(result);
};
