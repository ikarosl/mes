import type { BatchTerminationCheck, TerminateProductionBatchPayload } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

export function requireBatchTermination(
  check: BatchTerminationCheck,
  payload: TerminateProductionBatchPayload,
): void {
  if (!check.canTerminate)
    throw new ProductionDomainError('INVALID_STATE', check.blockers.join('；'));
  if (payload.version !== check.version || payload.checkToken !== check.checkToken)
    throw new ProductionDomainError(
      'CONCURRENT_MODIFICATION',
      '结束核对内容已变化，请重新加载并核对',
    );
  if (!payload.confirmImpacts || !payload.reason.trim() || !payload.materialReviewNote.trim())
    throw new ProductionDomainError('INVALID_INPUT', '请确认联动事项并填写结束原因、物料核对说明');
  for (const quantity of [payload.availableQuantity, payload.additionalScrapQuantity]) {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 99_999_999)
      throw new ProductionDomainError('INVALID_INPUT', '产出处置数量必须是范围内的非负整数');
  }
  if (
    payload.availableQuantity +
      payload.additionalScrapQuantity +
      Number(check.existingScrapQuantity) >
    99_999_999
  )
    throw new ProductionDomainError('INVALID_INPUT', '累计产出处置数量超过允许范围');
}
