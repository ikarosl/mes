import { z } from 'zod';
import type { ProductionApprovalResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const identifier = z.string().regex(/^[1-9]\d*$/);
const approvalResult = z.object({ subjectId: identifier, approvalInstanceId: identifier }).strict();
export const productionApprovalResultCodec = {
  encode: (value) => approvalResult.parse(value),
  decode: (value) => approvalResult.parse(value),
} satisfies IdempotencyResultCodec<ProductionApprovalResult>;
