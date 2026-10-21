import { z } from 'zod';
import type {
  ProcurementReceiptCommandResult,
  ConfirmProcurementInboundResult,
  VoidProcurementReceiptCommandResult,
} from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';
const id = z.string().regex(/^[1-9]\d*$/);
const voidReceiptSchema = z
  .object({ receiptId: id, version: z.number().int().min(0).max(2147483647) })
  .strict();
const receiptSchema = z
  .object({
    roundId: id.nullable().optional(),
    receiptId: id,
    receiptLineId: id.nullable(),
    caseIds: z.array(id),
    inspectionId: id.nullable(),
    supplierReturnId: id.nullable(),
    acceptanceId: id.optional(),
  })
  .strict();
const inboundSchema = z
  .object({
    inboundId: id,
    inboundNo: z.string().min(1),
    details: z
      .array(
        z
          .object({
            receiptLineId: id,
            allocationId: id,
            batchId: id,
            inboundDetailId: id,
            transactionId: id,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const receiptCommandResultCodec = {
  encode: (value) => receiptSchema.parse(value),
  decode: (value) => receiptSchema.parse(value),
} satisfies IdempotencyResultCodec<ProcurementReceiptCommandResult>;
export const voidReceiptCommandResultCodec = {
  encode: (value) => voidReceiptSchema.parse(value),
  decode: (value) => voidReceiptSchema.parse(value),
} satisfies IdempotencyResultCodec<VoidProcurementReceiptCommandResult>;
export const inboundCommandResultCodec = {
  encode: (value) => inboundSchema.parse(value),
  decode: (value) => inboundSchema.parse(value),
} satisfies IdempotencyResultCodec<ConfirmProcurementInboundResult>;
