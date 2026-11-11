import type { ReceiptVoidLineVersion } from '@company/contracts';
export function receiptVoidBlockedReason(input: {
  isVoided: boolean;
  hasExecution: boolean;
  dependentPurchaseNos: readonly string[];
}): string | null {
  if (input.isVoided) return '该到货登记已作废，历史记录仍可查阅';
  if (input.hasExecution) return '整单已有实际入库，不能作废到货登记';
  if (input.dependentPurchaseNos.length) {
    const names = [...new Set(input.dependentPurchaseNos)];
    return `仍有有效补单引用该到货：${names.slice(0, 5).join('、')}${names.length > 5 ? '等' : ''}。请先核对相关补单状态`;
  }
  return null;
}
export function receiptVoidVersionsMatch(
  expected: readonly ReceiptVoidLineVersion[],
  actual: readonly ReceiptVoidLineVersion[],
): boolean {
  if (!actual.length || expected.length !== actual.length) return false;
  const byId = new Map(expected.map((line) => [line.receiptLineId, line.version]));
  return (
    byId.size === expected.length &&
    actual.every((line) => byId.get(line.receiptLineId) === line.version)
  );
}
