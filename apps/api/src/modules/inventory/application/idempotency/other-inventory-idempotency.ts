import { z } from 'zod';
import type { OtherInventoryOrder } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const positiveId = z.string().regex(/^[1-9]\d*$/);
const nullableId = positiveId.nullable();
const nullableText = z.string().nullable();
const line = z
  .object({
    id: positiveId,
    lineNo: z.number().int().positive(),
    itemKind: z.enum(['material', 'finished_product']),
    itemId: nullableId,
    materialVariantId: nullableId,
    productId: nullableId,
    itemCode: z.string(),
    itemName: z.string(),
    materialVariantCode: nullableText,
    unit: z.string(),
    quantity: z.string().regex(/^\d+(?:\.0+)?$/),
    targetMode: z.enum(['new', 'existing']),
    newBatchKey: nullableText,
    batchId: nullableId,
    batchCode: nullableText,
    remark: nullableText,
    isDeleted: z.boolean(),
    inventoryTransactionId: nullableId,
  })
  .strict();
const order = z
  .object({
    id: positiveId,
    orderNo: z.string(),
    direction: z.enum(['inbound', 'outbound']),
    status: z.enum(['pending', 'pending_picking', 'completed', 'cancelled']),
    version: z.number().int().nonnegative(),
    reason: z.string(),
    remark: nullableText,
    details: z.array(line),
    createdById: positiveId,
    createdByName: nullableText,
    createdAt: z.string(),
    operatorId: nullableId,
    operatorName: nullableText,
    confirmedAt: nullableText,
    cancelReason: nullableText,
    cancelledById: nullableId,
    cancelledByName: nullableText,
    cancelledAt: nullableText,
  })
  .strict();
export const otherInventoryResultCodec = {
  encode: (value) => order.parse(value),
  decode: (value) => order.parse(value),
} satisfies IdempotencyResultCodec<OtherInventoryOrder>;
