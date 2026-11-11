import { z } from 'zod';
import type {
  ProcurementReceiptCommandResult,
  ConfirmProcurementInboundResult,
  VoidProcurementReceiptCommandResult,
  ReceiptHandlingItem,
} from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';
const id = z.string().regex(/^[1-9]\d*$/);
const receiptSchema = z.object({ receiptId: id }).strict();
const voidSchema = z
  .object({ receiptId: id, version: z.number().int().min(0).max(2147483647) })
  .strict();
const inboundSchema = z
  .object({
    inboundId: id,
    inboundNo: z.string().min(1),
    details: z
      .array(
        z
          .object({ receiptLineId: id, batchId: id, inboundDetailId: id, transactionId: id })
          .strict(),
      )
      .min(1),
  })
  .strict();
const handlingSchema = z
  .object({
    id,
    receiptLineId: id,
    inboundId: z.null(),
    otherHandlingNote: z.string().min(1),
    createdBy: id,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const receiptCommandResultCodec = {
  encode: (value) => receiptSchema.parse(value),
  decode: (value) => receiptSchema.parse(value),
} satisfies IdempotencyResultCodec<ProcurementReceiptCommandResult>;
export const voidReceiptCommandResultCodec = {
  encode: (value) => voidSchema.parse(value),
  decode: (value) => voidSchema.parse(value),
} satisfies IdempotencyResultCodec<VoidProcurementReceiptCommandResult>;
export const inboundCommandResultCodec = {
  encode: (value) => inboundSchema.parse(value),
  decode: (value) => inboundSchema.parse(value),
} satisfies IdempotencyResultCodec<ConfirmProcurementInboundResult>;
export const receiptHandlingResultCodec = {
  encode: (value) => handlingSchema.parse(value),
  decode: (value) => handlingSchema.parse(value),
} satisfies IdempotencyResultCodec<ReceiptHandlingItem>;
