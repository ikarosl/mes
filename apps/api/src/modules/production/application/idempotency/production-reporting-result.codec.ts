import { z } from 'zod';
import {
  BATCH_STEP_ABNORMAL_REVIEW_STATUSES,
  BATCH_STEP_REPORT_TYPES,
  BATCH_STEP_STATUSES,
  PRODUCTION_BATCH_STATUSES,
} from '@company/constants';
import type {
  BatchStepReportCommandResult,
  CorrectBatchStepReportCommandResult,
  BatchReverseStepReportsCommandResult,
} from '@company/contracts';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import {
  BATCH_REVERSE_STEP_REPORTS_SCOPE,
  CORRECT_HISTORICAL_STEP_REPORT_SCOPE,
  CREATE_HISTORICAL_STEP_REPORT_SCOPE,
  CORRECT_STEP_REPORT_IDEMPOTENCY_SCOPE,
  CREATE_STEP_REPORT_IDEMPOTENCY_SCOPE,
} from './production-idempotency-scopes.contract.js';

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
    abnormalOrigin: z.enum(['current_step', 'previous_step']).nullable(),
    unit: z.string(),
    remark: z.string().nullable(),
    createdById: z.string(),
    createdByName: z.string().nullable(),
    createdAt: z.string(),
    isEffective: z.boolean(),
    canReverse: z.boolean(),
    canCorrect: z.boolean(),
    correctionBlockedReason: z.string().nullable(),
  })
  .strict();

const dispositionSchema = z
  .object({
    dispositionId: z.string(),
    dispositionNo: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    sourceReportId: z.string(),
    sourceAbnormalQuantity: z.string(),
    abnormalOrigin: z.enum(['current_step', 'previous_step']),
    reviewStatus: z.enum(BATCH_STEP_ABNORMAL_REVIEW_STATUSES),
    dispositionType: z.enum(['rework', 'scrap']).nullable(),
    remark: z.string().nullable(),
    version: z.number().int().nonnegative(),
    createdAt: z.string(),
  })
  .strict();

const quantityFields = {
  upperLimitQuantity: z.string(),
  requiredNormalQuantity: z.string(),
  availableReportQuantity: z.string(),
  effectiveReportedQuantity: z.string(),
  effectiveDirectReportedQuantity: z.string(),
  effectiveDirectNormalQuantity: z.string(),
  effectiveDirectAbnormalQuantity: z.string(),
  effectiveNormalQuantity: z.string(),
  effectiveAbnormalQuantity: z.string(),
  remainingNormalQuantity: z.string(),
  previousStepNormalQuantity: z.string().nullable(),
  directReportedVsPreviousNormalDifference: z.string().nullable(),
  normalVsPreviousNormalDifference: z.string().nullable(),
  normalVsTargetDifference: z.string(),
};
const summaryFields = {
  ...quantityFields,
  productionBatchId: z.string(),
  stepRecordId: z.string(),
  stepStatus: z.enum(BATCH_STEP_STATUSES),
  stepVersion: z.number().int().nonnegative(),
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

export const createHistoricalStepReportResultCodec = {
  ...codec(createSchema),
  scope: CREATE_HISTORICAL_STEP_REPORT_SCOPE,
} as const;
export const correctHistoricalStepReportResultCodec = {
  ...codec(correctSchema),
  scope: CORRECT_HISTORICAL_STEP_REPORT_SCOPE,
} as const;
const batchReverseSchema: z.ZodType<BatchReverseStepReportsCommandResult> = z
  .object({
    productionBatchId: z.string(),
    batchStatus: z.enum(PRODUCTION_BATCH_STATUSES),
    phase: z.enum(['execution', 'history']),
    reversals: z.array(z.object({ originalReportId: z.string(), reversal: reportSchema }).strict()),
    steps: z.array(
      z
        .object({
          ...quantityFields,
          stepRecordId: z.string(),
          stepStatus: z.enum(BATCH_STEP_STATUSES),
          stepVersion: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export const batchReverseStepReportsResultCodec = {
  ...codec(batchReverseSchema),
  scope: BATCH_REVERSE_STEP_REPORTS_SCOPE,
} as const;
