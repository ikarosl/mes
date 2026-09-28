import type { CreatePurchaseInboundPayload } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

export function assertValidPurchaseInboundDraft(payload: CreatePurchaseInboundPayload): void {
  if (payload.details.length === 0)
    throw new ProductionDomainError('INVALID_INPUT', '入库单至少需要一条明细');
  const seen = new Set<string>();
  for (const detail of payload.details) {
    const key = `${detail.itemId}:${detail.materialVariantId}`;
    if (detail.inboundQuantity <= 0 || seen.has(key))
      throw new ProductionDomainError('INVALID_INPUT', '入库明细存在重复物料版本或无效数量');
    seen.add(key);
  }
}
