import type { DemandCorrectionCheck, SubmitDemandCorrectionPayload } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

export function correctionRemaining(
  check: DemandCorrectionCheck,
  payload: SubmitDemandCorrectionPayload,
): number {
  if (!check.canCorrect)
    throw new ProductionDomainError('INVALID_STATE', check.blockers.join('；'));
  if (check.version !== payload.version || check.checkToken !== payload.checkToken)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '需求及关联事实已变化，请重新核对');
  if (!payload.reason.trim()) throw new ProductionDomainError('INVALID_INPUT', '请填写更正原因');
  const target = payload.targetTotalQuantity;
  if (!Number.isSafeInteger(target) || target < Number(check.issuedQuantity) || target > 99_999_999)
    throw new ProductionDomainError('INVALID_INPUT', '更正后总量必须是不少于链上累计已领量的整数');
  const remaining = target - Number(check.issuedQuantity);
  if (payload.kind === 'close' && (remaining !== 0 || check.demandType !== 'manual_additional'))
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '单条关闭仅适用于人工追加；补料须按更正数量明确解除剩余要求',
    );
  if (payload.kind === 'quantity' && target === Number(check.currentTotalQuantity))
    throw new ProductionDomainError('INVALID_INPUT', '更正后总量与当前要求相同');
  return remaining;
}
