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
const output = z
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
    status: z.enum(PRODUCTION_OUTPUT_STATUSES),
    cancellation: z
      .object({ id, reason: z.string(), createdBy: id, createdAt: time })
      .strict()
      .nullable(),
    inbound: inbound.nullable(),
  })
  .strict();

export const productionOutputResultCodec: IdempotencyResultCodec<ProductionOutputItem> = {
  encode: (value) => output.parse(value),
  decode: (value) => output.parse(value),
};
export const productionOutputInboundResultCodec: IdempotencyResultCodec<ProductionOutputInboundResult> =
  {
    encode: (value) => inbound.parse(value),
    decode: (value) => inbound.parse(value),
  };
