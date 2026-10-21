import { z } from 'zod';
import type { ProcessInspectionCommandResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';
export const PROCESS_INSPECTION_CREATE_SCOPE = 'quality.process-inspection.create.v1' as const;
export const PROCESS_INSPECTION_CORRECT_SCOPE = 'quality.process-inspection.correct.v1' as const;
export const PROCESS_INSPECTION_REVERSE_SCOPE = 'quality.process-inspection.reverse.v1' as const;
const id = z.string().regex(/^[1-9]\d*$/);
const result = z
  .object({ inspectionId: id, recordId: id, version: z.number().int().nonnegative() })
  .strict();
export const processInspectionResultCodec = {
  encode: (value) => result.parse(value),
  decode: (value) => result.parse(value),
} satisfies IdempotencyResultCodec<ProcessInspectionCommandResult>;
