import { z } from 'zod';
import type { FinishedGoodsInboundCommandResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const resultSchema = z.object({ inboundId: z.string().regex(/^[1-9]\d*$/) }).strict();
export const productionFinishedInboundResultCodec = {
  encode: (value) => resultSchema.parse(value),
  decode: (value) => resultSchema.parse(value),
} satisfies IdempotencyResultCodec<FinishedGoodsInboundCommandResult>;
