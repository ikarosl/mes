import { z } from 'zod';
import {
  BATCH_STEP_ABNORMAL_REVIEW_STATUSES,
  BATCH_STEP_REPORT_TYPES,
  BATCH_STEP_STATUSES,
} from '@company/constants';
import type {
  BatchStepReportCommandResult,
  CorrectBatchStepReportCommandResult,
} from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import { CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE } from './correct-step-report-idempotency.contract.js';
import { CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE } from './create-step-report-idempotency.contract.js';

const reportSchema = z
  .object({
    reportId: z.string(),
    reportNo: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    reportType: z.enum(BATCH_STEP_REPORT_TYPES),
    reversalOfReportId: z.string().nullable(),
    correctionOfReportId: z.string().nullable(),
    reportedQuantity: z.string(),
    normalQuantity: z.string(),
    abnormalQuantity: z.string(),
    unit: z.string(),
    remark: z.string().nullable(),
    createdById: z.string(),
    createdByName: z.string().nullable(),
    createdAt: z.string(),
    isEffective: z.boolean(),
  })
  .strict();

const dispositionSchema = z
  .object({
    dispositionId: z.string(),
    dispositionNo: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    sourceReportId: z.string(),
    reviewStatus: z.enum(BATCH_STEP_ABNORMAL_REVIEW_STATUSES),
    dispositionType: z.enum(['rework', 'scrap']).nullable(),
    remark: z.string().nullable(),
    version: z.number().int().nonnegative(),
    createdAt: z.string(),
  })
  .strict();

const summaryFields = {
  productionBatchId: z.string(),
  stepRecordId: z.string(),
  stepStatus: z.enum(BATCH_STEP_STATUSES),
  stepVersion: z.number().int().nonnegative(),
  requiredNormalQuantity: z.string(),
  releasedNormalQuantity: z.string(),
  availableNormalQuantity: z.string(),
  effectiveReportedQuantity: z.string(),
  effectiveNormalQuantity: z.string(),
  effectiveAbnormalQuantity: z.string(),
  remainingNormalQuantity: z.string(),
};

const createSchema: z.ZodType<BatchStepReportCommandResult> = z
  .object({
    ...summaryFields,
    report: reportSchema,
    abnormalDisposition: dispositionSchema.nullable(),
  })
  .strict();
const correctSchema: z.ZodType<CorrectBatchStepReportCommandResult> = z
  .object({
    ...summaryFields,
    reversal: reportSchema,
    replacement: reportSchema,
    abnormalDisposition: dispositionSchema.nullable(),
  })
  .strict();

const codec = <T>(schema: z.ZodType<T>): IdempotencyResultCodec<T> => ({
  encode: (result) => schema.parse(result) as unknown as JsonValue,
  decode: (stored) => schema.parse(stored),
});

export const createStepReportResultCodec = {
  ...codec(createSchema),
  scope: CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE,
} as const;
export const correctStepReportResultCodec = {
  ...codec(correctSchema),
  scope: CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE,
} as const;
