import { z } from 'zod';
import { INBOUND_ORDER_STATUSES } from '@company/constants';
import type { PurchaseInboundOrderItem } from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import { CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';
import { CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';

const schema: z.ZodType<PurchaseInboundOrderItem> = z
  .object({
    inboundId: z.string(),
    inboundNo: z.string(),
    sourceType: z.literal('purchased'),
    provider: z.string().nullable(),
    status: z.enum(INBOUND_ORDER_STATUSES),
    inboundAt: z.string().nullable(),
    operatorId: z.string().nullable(),
    operatorName: z.string().nullable(),
    createdById: z.string().nullable(),
    createdByName: z.string().nullable(),
    createdAt: z.string(),
    version: z.number().int().nonnegative(),
    remark: z.string().nullable(),
    cancelReason: z.string().nullable().optional(),
    cancelledById: z.string().nullable().optional(),
    cancelledByName: z.string().nullable().optional(),
    cancelledAt: z.string().nullable().optional(),
    detailCount: z.number().int().nonnegative(),
    totalInboundQuantity: z.string(),
    quantitySummary: z.array(z.object({ unit: z.string(), quantity: z.string() }).strict()),
    details: z.array(
      z
        .object({
          id: z.string(),
          itemId: z.string(),
          materialVariantId: z.string(),
          materialVariantCode: z.string(),
          itemCode: z.string(),
          itemName: z.string(),
          itemBatchId: z.string(),
          batchCode: z.string(),
          inboundQuantity: z.string(),
          unit: z.string(),
          stockStatus: z.literal('available'),
          inventoryTransactionId: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
const codec: IdempotencyResultCodec<PurchaseInboundOrderItem> = {
  encode: (value) => schema.parse(value) as unknown as JsonValue,
  decode: (value) => schema.parse(value),
};
export const createPurchaseInboundResultCodec = {
  ...codec,
  scope: CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE,
} as const;
export const confirmPurchaseInboundResultCodec = {
  ...codec,
  scope: CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE,
} as const;
