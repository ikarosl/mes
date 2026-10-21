/** Keep the operator's text unchanged while validating integer inbound quantities. */
export function parseInboundQuantity(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity <= 99_999_999 ? quantity : null;
}
