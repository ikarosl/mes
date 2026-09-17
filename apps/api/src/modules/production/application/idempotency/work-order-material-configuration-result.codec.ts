import { z } from 'zod';
import type { SaveWorkOrderMaterialConfigurationResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const schema = z
  .object({
    workOrderId: z.string().regex(/^[1-9]\d*$/),
    version: z.number().int().nonnegative(),
  })
  .strict();

export const workOrderMaterialConfigurationResultCodec = {
  encode: (result) => schema.parse(result),
  decode: (stored) => schema.parse(stored),
} satisfies IdempotencyResultCodec<SaveWorkOrderMaterialConfigurationResult>;
