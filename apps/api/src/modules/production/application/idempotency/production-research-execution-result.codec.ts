import { z } from 'zod';
import type {
  ResearchExecutionStartResult,
  ProductionExecutionCompletionResult,
} from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const id = z.string().regex(/^[1-9]\d*$/);
const startSchema = z
  .object({
    productionBatchId: id,
    batchStatus: z.literal('doing'),
    startedAt: z.string().datetime({ offset: true }),
    version: z.number().int().positive(),
  })
  .strict();
const completionSchema = z
  .object({
    productionBatchId: id,
    batchStatus: z.enum(['closing', 'completed']),
    closeoutId: id,
    lastStepReportedQuantity: z.string().regex(/^\d+(\.0+)?$/),
    executionCompletedAt: z.string().datetime({ offset: true }),
    executionCompletedById: id,
    version: z.number().int().positive(),
  })
  .strict();

export const researchExecutionStartResultCodec = {
  encode: (value) => startSchema.parse(value),
  decode: (value) => startSchema.parse(value),
} satisfies IdempotencyResultCodec<ResearchExecutionStartResult>;
export const researchExecutionCompletionResultCodec = {
  encode: (value) => completionSchema.parse(value),
  decode: (value) => completionSchema.parse(value),
} satisfies IdempotencyResultCodec<ProductionExecutionCompletionResult>;
