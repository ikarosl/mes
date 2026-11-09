import type { HandleProductionTrackingAbnormalityPayload } from '@company/contracts';
import { MAX_PERSISTED_INTEGER_QUANTITY } from './integer-quantity.js';
import { ProductionDomainError } from './production.errors.js';

function requireQuantity(value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > MAX_PERSISTED_INTEGER_QUANTITY)
    throw new ProductionDomainError('INVALID_INPUT', '数量必须是允许范围内的整数');
}

export function requireTrackingAffectedQuantity(affected: number, current: number): void {
  requireQuantity(affected, 1);
  if (affected > current)
    throw new ProductionDomainError('INVALID_INPUT', '异常影响数量不能超过当前盘量');
}

export function requireTrackingDispositionQuantities(
  affected: number,
  current: number,
  payload: HandleProductionTrackingAbnormalityPayload,
): void {
  requireQuantity(payload.repairedQuantity, 0);
  requireQuantity(payload.scrappedQuantity, 0);
  const newlyDisposed = payload.repairedQuantity + payload.scrappedQuantity;
  if (newlyDisposed > current)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '返修数量与本次新增报废数量之和不能超过当前剩余盘量',
    );
  const handlingIds = new Set<string>();
  let referencedQuantity = 0;
  for (const reference of payload.scrapReferences) {
    requireQuantity(reference.quantity, 1);
    if (handlingIds.has(reference.handlingId))
      throw new ProductionDomainError('INVALID_INPUT', '一次异常处理不能重复关联同一报废来源');
    handlingIds.add(reference.handlingId);
    referencedQuantity += reference.quantity;
  }
  if (newlyDisposed + referencedQuantity !== affected)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '返修、本次新增报废及关联已有报废数量之和必须等于异常影响数量',
    );
}
