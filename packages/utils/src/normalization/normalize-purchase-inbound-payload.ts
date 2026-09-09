import type { CreatePurchaseInboundPayload } from '@company/contracts';

export const normalizePurchaseInboundPayload = (
  payload: CreatePurchaseInboundPayload,
): CreatePurchaseInboundPayload => ({
  inboundNo: payload.inboundNo?.trim() || null,
  provider: payload.provider?.trim() || null,
  remark: payload.remark?.trim() || null,
  details: payload.details.map((line) => ({
    itemId: line.itemId,
    materialVariantId: line.materialVariantId,
    batchCode: line.batchCode.trim(),
    inboundQuantity: Number(line.inboundQuantity),
    remark: line.remark?.trim() || null,
  })),
});
