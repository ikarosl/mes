import { z } from 'zod';
import type { ProductionApprovalResult, BatchCloseoutCommandResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const identifier = z.string().regex(/^[1-9]\d*$/);
const approvalResult = z.object({ subjectId: identifier, approvalInstanceId: identifier }).strict();
const closeoutResult = z.object({ closeoutId: identifier, batchId: identifier }).strict();
export const productionApprovalResultCodec = {
  encode: (value) => approvalResult.parse(value),
  decode: (value) => approvalResult.parse(value),
} satisfies IdempotencyResultCodec<ProductionApprovalResult>;
export const batchCloseoutResultCodec = {
  encode: (value) => closeoutResult.parse(value),
  decode: (value) => closeoutResult.parse(value),
} satisfies IdempotencyResultCodec<BatchCloseoutCommandResult>;
