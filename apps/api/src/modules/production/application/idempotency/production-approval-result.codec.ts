import { z } from 'zod';
import type { ProductionApprovalResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const identifier = z.string().regex(/^[1-9]\d*$/);
const approvalResult = z.discriminatedUnion('status', [
  z
    .object({
      subjectId: identifier,
      approvalInstanceId: identifier,
      status: z.literal('pending'),
    })
    .strict(),
  z
    .object({
      subjectId: identifier,
      approvalInstanceId: z.null(),
      status: z.literal('approved'),
    })
    .strict(),
]);
// 旧快照保存的是送审成功时的响应；后来审批结果不改变该次响应的 pending 语义。
const storedApprovalResult = z.union([
  approvalResult,
  z
    .object({ subjectId: identifier, approvalInstanceId: identifier })
    .strict()
    .transform((value) => ({ ...value, status: 'pending' as const })),
]);
export const productionApprovalResultCodec = {
  encode: (value) => approvalResult.parse(value),
  decode: (value) => storedApprovalResult.parse(value),
} satisfies IdempotencyResultCodec<ProductionApprovalResult>;
