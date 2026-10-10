import { z } from 'zod';
import { PRODUCTION_BATCH_STATUSES } from '@company/constants';
import type { WithdrawBatchCloseoutResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const id = z.string().regex(/^[1-9]\d*$/);
const resultSchema = z
  .object({
    closeoutId: id,
    batchId: id,
    batchStatus: z.enum(PRODUCTION_BATCH_STATUSES),
    version: z.number().int().positive(),
    closeoutVersion: z.number().int().positive(),
    entryActionId: id,
    withdrawalActionId: id,
  })
  .strict();

export const withdrawBatchCloseoutResultCodec = {
  encode: (value) => resultSchema.parse(value),
  decode: (value) => resultSchema.parse(value),
} satisfies IdempotencyResultCodec<WithdrawBatchCloseoutResult>;
