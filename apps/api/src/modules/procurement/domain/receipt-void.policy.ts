import type { ReceiptVoidLineVersion } from '@company/contracts';

/** 作废资格仅依赖整单真实执行和仍有效的补单引用；已做检验不构成阻断。 */
export function receiptVoidBlockedReason(input: {
  isVoided: boolean;
  hasExecution: boolean;
  dependentPurchaseNos: readonly string[];
}): string | null {
  if (input.isVoided) return '该到货登记已作废，历史记录仍可查阅';
  if (input.hasExecution)
    return '整单已有实际入库或实际退回，不能作废到货登记；真实到货的后续处置请按拒收或实际退回办理';
  if (input.dependentPurchaseNos.length) {
    const names = [...new Set(input.dependentPurchaseNos)];
    const suffix = names.length > 5 ? ` 等 ${names.length} 张补单` : '';
    return `仍有关联补单依赖该到货：${names.slice(0, 5).join('、')}${suffix}。请先人工处理关联补单；已绑定补单的解除或换归属暂不支持`;
  }
  return null;
}

export function receiptVoidVersionsMatch(
  expected: readonly ReceiptVoidLineVersion[],
  actual: readonly ReceiptVoidLineVersion[],
): boolean {
  if (!actual.length || expected.length !== actual.length) return false;
  const byId = new Map(expected.map((line) => [line.receiptLineId, line]));
  if (byId.size !== expected.length) return false;
  return actual.every((line) => {
    const version = byId.get(line.receiptLineId);
    return (
      version?.version === line.version &&
      version.roundId === line.roundId &&
      version.roundVersion === line.roundVersion
    );
  });
}
