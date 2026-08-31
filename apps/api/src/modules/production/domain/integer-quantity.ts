export const MAX_PERSISTED_INTEGER_QUANTITY = 99_999_999;

/**
 * 解析历史 DECIMAL(12,4) 表示，同时执行当前仅允许整数数量的规则。
 * `12.0000` 这类值仍可读取；带小数或超出范围的值不得进入业务计算。
 */
export const integerQuantity = (value: number | string): number => {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError('数量必须是安全整数');
  }
  return quantity;
};

/** 保留现有四位零的 API/审计表示，同时避免使用小数运算。 */
export const fixedIntegerQuantity = (value: number | string): string =>
  integerQuantity(value).toFixed(4);

export const multiplyIntegerQuantities = (
  left: number | string,
  right: number | string,
): string => {
  const result = BigInt(integerQuantity(left)) * BigInt(integerQuantity(right));
  if (result < 0n || result > BigInt(MAX_PERSISTED_INTEGER_QUANTITY)) {
    throw new RangeError(`数量乘积超过允许上限 ${MAX_PERSISTED_INTEGER_QUANTITY}`);
  }
  return `${result}.0000`;
};
