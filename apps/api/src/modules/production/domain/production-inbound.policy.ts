import type { CreatePurchaseInboundPayload } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

export function assertValidPurchaseInboundDraft(payload: CreatePurchaseInboundPayload): void {
  if (payload.details.length === 0)
    throw new ProductionDomainError('INVALID_INPUT', '入库单至少需要一条明细');
  const seen = new Set<string>();
  for (const detail of payload.details) {
    const key = `${detail.itemId}:${detail.batchCode}`;
    if (!detail.batchCode || detail.inboundQuantity <= 0 || seen.has(key))
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '入库明细存在空批次、重复物料批次或无效数量',
      );
    seen.add(key);
  }
}
