import { z } from 'zod';
import { PRODUCTION_OUTPUT_STATUSES } from '@company/constants';
import type { ProductionOutputInboundResult, ProductionOutputItem } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const id = z.string().regex(/^[1-9]\d*$/);
const quantity = z.string().regex(/^\d+$/);
const time = z.string().datetime({ offset: true });
const inbound = z
  .object({
    inboundId: id,
    inboundNo: z.string(),
    itemBatchId: id,
    batchCode: z.string(),
    inboundQuantity: quantity,
  })
  .strict();
const outputCore = z
  .object({
    id,
    productionBatchId: id,
    trackingCardId: id.nullable(),
    quantity,
    personnelId: id,
    personnelCode: z.string(),
    personnelName: z.string(),
    confirmedBy: id,
    confirmedAt: time,
    remark: z.string().nullable(),
    batchNo: z.string(),
    workOrderNo: z.string(),
    productId: id,
    productCode: z.string(),
    productName: z.string(),
    unit: z.string(),
    cardNo: z.string().nullable(),
    cancellation: z
      .object({ id, reason: z.string(), createdBy: id, createdAt: time })
      .strict()
      .nullable(),
  })
  .strict();

const output = outputCore.extend({
  status: z.enum(PRODUCTION_OUTPUT_STATUSES),
  receivedQuantity: quantity,
  pendingQuantity: quantity,
  receipts: z.array(inbound),
});
const legacyOutput = outputCore
  .extend({
    status: z.enum(['pending_inbound', 'inbounded', 'cancelled', 'no_inbound_required']),
    inbound: inbound.nullable(),
  })
  .transform(({ inbound: previousInbound, ...value }) => {
    const receivedQuantity = previousInbound?.inboundQuantity ?? '0';
    const pendingQuantity = value.cancellation
      ? 0n
      : BigInt(value.quantity) - BigInt(receivedQuantity);
    if (pendingQuantity < 0n) throw new Error('历史产出入库事实数量不一致');
    return {
      ...value,
      receivedQuantity,
      pendingQuantity: String(pendingQuantity),
      receipts: previousInbound ? [previousInbound] : [],
    };
  });

export const productionOutputResultCodec: IdempotencyResultCodec<ProductionOutputItem> = {
  encode: (value) => output.parse(value),
  // Historical receipts are only projected from the stored response, never from current state or inferred piece identities.
  decode: (value) => z.union([output, legacyOutput]).parse(value),
};
export const productionOutputInboundResultCodec: IdempotencyResultCodec<ProductionOutputInboundResult> =
  {
    encode: (value) => inbound.parse(value),
    decode: (value) => inbound.parse(value),
  };
