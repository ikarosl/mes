import { z } from 'zod';
import type { TerminateProductionBatchResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';
import { TERMINATE_BATCH_IDEMPOTENCY_SCOPE } from './production-idempotency-scopes.contract.js';

const schema = z
  .object({ terminationId: z.string().regex(/^\d+$/), batchId: z.string().regex(/^\d+$/) })
  .strict();
export const terminateBatchResultCodec = {
  scope: TERMINATE_BATCH_IDEMPOTENCY_SCOPE,
  encode: (value) => schema.parse(value),
  decode: (value) => schema.parse(value),
} satisfies IdempotencyResultCodec<TerminateProductionBatchResult> & { scope: string };
