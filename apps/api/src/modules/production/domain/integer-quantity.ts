export const MAX_PERSISTED_INTEGER_QUANTITY = 99_999_999;

/**
 * Parses the legacy DECIMAL(12,4) representation while enforcing the current integer-only
 * quantity rule. Values such as `12.0000` remain readable; fractional and out-of-range values do
 * not enter business calculations.
 */
export const integerQuantity = (value: number | string): number => {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError('Quantity must be a safe integer');
  }
  return quantity;
};

/** Keeps the existing four-zero API/audit representation without using fractional arithmetic. */
export const fixedIntegerQuantity = (value: number | string): string =>
  integerQuantity(value).toFixed(4);

export const multiplyIntegerQuantities = (
  left: number | string,
  right: number | string,
): string => {
  const result = BigInt(integerQuantity(left)) * BigInt(integerQuantity(right));
  if (result < 0n || result > BigInt(MAX_PERSISTED_INTEGER_QUANTITY)) {
    throw new RangeError(`Quantity multiplication exceeds ${MAX_PERSISTED_INTEGER_QUANTITY}`);
  }
  return `${result}.0000`;
};
