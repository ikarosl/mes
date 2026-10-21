import { z } from 'zod';
import type { RecordCloseoutMaterialLossResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const id = z.string().regex(/^[1-9]\d*$/);
const schema = z.object({ closeoutId: id, batchId: id, scrapId: id }).strict();
export const recordCloseoutMaterialLossResultCodec = {
  encode: (value) => schema.parse(value),
  decode: (value) => schema.parse(value),
} satisfies IdempotencyResultCodec<RecordCloseoutMaterialLossResult>;
