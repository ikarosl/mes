import { z } from 'zod';
import type { FinishedInspectionCommandResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';
export const FINISHED_INSPECTION_RECORD_SCOPE = 'quality.finished-inspection.record.v2' as const;
const id = z.string().regex(/^[1-9]\d*$/);
const result = z
  .object({ batchId: id, inspectionId: id, version: z.number().int().nonnegative() })
  .strict();
export const finishedInspectionResultCodec = {
  encode: (value) => result.parse(value),
  decode: (value) => result.parse(value),
} satisfies IdempotencyResultCodec<FinishedInspectionCommandResult>;
