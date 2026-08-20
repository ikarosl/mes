import { z } from 'zod';
import type { CompleteReworkResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const dispositionSchema = z.object({
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
});

const reportSchema = z.object({
  reportId: z.string(),
  reportNo: z.string(),
  productionBatchId: z.string(),
  stepRecordId: z.string(),
  reportType: z.enum(['normal', 'reversal']),
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
});

const reworkSchema = z.object({
  reworkId: z.string(),
  reworkNo: z.string(),
  abnormalDispositionId: z.string(),
  productionBatchId: z.string(),
  stepRecordId: z.string(),
  sourceReportId: z.string(),
  responsibleUserId: z.string(),
  responsibleUserName: z.string().nullable(),
  reworkQuantity: z.string(),
  unit: z.string(),
  status: z.enum(['pending', 'doing', 'completed', 'cancelled']),
  completedReportId: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  version: z.number().int(),
  remark: z.string().nullable(),
  createdAt: z.string(),
});

const schema = z.object({
  rework: reworkSchema,
  report: reportSchema,
  abnormalDisposition: dispositionSchema.nullable(),
});

export const completeReworkResultCodec: IdempotencyResultCodec<CompleteReworkResult> = {
  encode: (value) => schema.parse(value),
  decode: (value) => schema.parse(value),
};
