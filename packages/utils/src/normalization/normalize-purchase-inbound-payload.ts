import type { CreatePurchaseInboundPayload } from '@company/contracts';

export const normalizePurchaseInboundPayload = (
  payload: CreatePurchaseInboundPayload,
): CreatePurchaseInboundPayload => ({
  provider: payload.provider?.trim() || null,
  remark: payload.remark?.trim() || null,
  details: payload.details.map((line) => ({
    itemId: line.itemId,
    materialVariantId: line.materialVariantId,
    inboundQuantity: Number(line.inboundQuantity),
    remark: line.remark?.trim() || null,
  })),
});
