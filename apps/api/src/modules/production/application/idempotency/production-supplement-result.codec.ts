import { z } from 'zod';
import type { ApproveScrapSupplementResult } from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';

const schema: z.ZodType<ApproveScrapSupplementResult> = z.object({
  disposition: z.object({
    dispositionId: z.string(),
    dispositionNo: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    sourceReportId: z.string(),
    abnormalOrigin: z.enum(['current_step', 'previous_step']),
    reviewStatus: z.enum(['pending_review', 'approved', 'rejected', 'cancelled']),
    dispositionType: z.enum(['rework', 'scrap']).nullable(),
    remark: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
  }),
  scrapRecord: z.object({
    scrapRecordId: z.string(),
    sourceReportId: z.string(),
    scrapQuantity: z.string(),
    unit: z.string(),
  }),
  reproductionAuthorization: z.object({
    authorizationId: z.string(),
    scrapRecordId: z.string(),
    supplementId: z.string(),
    entryStepRecordId: z.string(),
    quotaEndStepRecordId: z.string(),
    authorizedQuantity: z.string(),
    authorizedBy: z.string(),
    authorizedAt: z.string(),
  }),
  supplement: z.object({
    supplementId: z.string(),
    supplementNo: z.string(),
    scrapRecordId: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    status: z.literal('approved'),
    remark: z.string().nullable(),
    createdAt: z.string(),
    demands: z.array(
      z.object({
        originalDemandId: z.string(),
        demandId: z.string(),
        requirementBasisId: z.string(),
        productMaterialId: z.string(),
        itemId: z.string(),
        materialVariantId: z.string(),
        materialVariantCode: z.string(),
        itemCode: z.string(),
        itemName: z.string(),
        supplementQuantity: z.string(),
        unit: z.string(),
      }),
    ),
  }),
});

export const productionSupplementResultCodec: IdempotencyResultCodec<ApproveScrapSupplementResult> =
  {
    encode: (value) => schema.parse(value) as unknown as JsonValue,
    decode: (value) => schema.parse(value),
  };
