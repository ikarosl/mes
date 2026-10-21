import { z } from 'zod';
import type {
  FinishedInspectionCommandResult,
  StartFinishedInspectionResult,
} from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';
export const FINISHED_INSPECTION_START_SCOPE = 'quality.finished-inspection.start.v1' as const;
export const FINISHED_REINSPECTION_BEGIN_SCOPE = 'quality.finished-reinspection.begin.v1' as const;
export const FINISHED_INSPECTION_RECORD_SCOPE = 'quality.finished-inspection.record.v3' as const;
const id = z.string().regex(/^[1-9]\d*$/);
const result = z
  .object({ batchId: id, inspectionId: id, version: z.number().int().nonnegative() })
  .strict();
export const finishedInspectionResultCodec = {
  encode: (value) => result.parse(value),
  decode: (value) => result.parse(value),
} satisfies IdempotencyResultCodec<FinishedInspectionCommandResult>;

const startResult = z
  .object({ batchId: id, roundId: id, version: z.number().int().nonnegative() })
  .strict();
export const finishedInspectionStartResultCodec = {
  encode: (value) => startResult.parse(value),
  decode: (value) => startResult.parse(value),
} satisfies IdempotencyResultCodec<StartFinishedInspectionResult>;
