import type { CreateMaterialOutboundPayload } from '@company/contracts';

export const normalizeMaterialOutboundPayload = (
  payload: CreateMaterialOutboundPayload,
): CreateMaterialOutboundPayload => ({
  details: payload.details.map((detail) => ({
    allocationId: detail.allocationId,
    outboundQuantity: detail.outboundQuantity,
  })),
  remark: payload.remark?.trim() || null,
});
