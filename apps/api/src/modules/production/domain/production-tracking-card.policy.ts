import { PRODUCTION_TRACKING_CARD_BATCH_LIMIT } from '@company/constants';
import { MAX_PERSISTED_INTEGER_QUANTITY } from './integer-quantity.js';
import { ProductionDomainError } from './production.errors.js';

export function requireTrackingCardQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_PERSISTED_INTEGER_QUANTITY)
    throw new ProductionDomainError('INVALID_INPUT', '建卡数量必须是1至99999999之间的整数');
}

export function splitTrackingCardQuantities(
  totalQuantity: number,
  quantityPerCard: number,
): number[] {
  requireTrackingCardQuantity(totalQuantity);
  requireTrackingCardQuantity(quantityPerCard);
  const count = Math.ceil(totalQuantity / quantityPerCard);
  if (count > PRODUCTION_TRACKING_CARD_BATCH_LIMIT)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      `每批最多建立${PRODUCTION_TRACKING_CARD_BATCH_LIMIT}张追踪卡，请调整总数量或每盘数量`,
    );
  return Array.from({ length: count }, (_, index) =>
    Math.min(quantityPerCard, totalQuantity - index * quantityPerCard),
  );
}
