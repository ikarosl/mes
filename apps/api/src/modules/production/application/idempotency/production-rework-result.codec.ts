import { z } from 'zod';
import {
  BATCH_STEP_ABNORMAL_DISPOSITION_TYPES,
  BATCH_STEP_ABNORMAL_ORIGINS,
  BATCH_STEP_ABNORMAL_REVIEW_STATUSES,
  BATCH_STEP_REPORT_TYPES,
  PRODUCTION_REPORT_QUANTITY_MAX,
  REWORK_STATUSES,
} from '@company/constants';
import type { CompleteReworkResult } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const quantitySchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => Number(value) <= PRODUCTION_REPORT_QUANTITY_MAX);

const dispositionSchema = z
  .object({
    dispositionId: z.string(),
    dispositionNo: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    sourceReportId: z.string(),
    sourceAbnormalQuantity: quantitySchema,
    abnormalOrigin: z.enum(BATCH_STEP_ABNORMAL_ORIGINS),
    reviewStatus: z.enum(BATCH_STEP_ABNORMAL_REVIEW_STATUSES),
    dispositionType: z.enum(BATCH_STEP_ABNORMAL_DISPOSITION_TYPES).nullable(),
    remark: z.string().nullable(),
    version: z.number().int(),
    createdAt: z.string(),
  })
  .strict();

const reportSchema = z
  .object({
    reportId: z.string(),
    reportNo: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    reportType: z.enum(BATCH_STEP_REPORT_TYPES),
    reversalOfReportId: z.string().nullable(),
    correctionOfReportId: z.string().nullable(),
    reportedQuantity: quantitySchema,
    normalQuantity: quantitySchema,
    abnormalQuantity: quantitySchema,
    abnormalOrigin: z.enum(BATCH_STEP_ABNORMAL_ORIGINS).nullable(),
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

const reworkSchema = z
  .object({
    reworkId: z.string(),
    reworkNo: z.string(),
    abnormalDispositionId: z.string(),
    productionBatchId: z.string(),
    stepRecordId: z.string(),
    sourceReportId: z.string(),
    responsibleUserId: z.string(),
    responsibleUserName: z.string().nullable(),
    reworkQuantity: quantitySchema,
    unit: z.string(),
    status: z.enum(REWORK_STATUSES),
    completedNormalReportId: z.string().nullable(),
    completedAbnormalReportId: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    version: z.number().int(),
    remark: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();

const schema = z
  .object({
    rework: reworkSchema,
    normalReport: reportSchema.nullable(),
    abnormalReport: reportSchema.nullable(),
    abnormalDisposition: dispositionSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const { rework, normalReport, abnormalReport, abnormalDisposition } = value;
    const invalid = (path: string[], message: string): void => {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };
    if (!normalReport && !abnormalReport) invalid([], '返工完成必须至少生成一类正数结果报工');
    if (rework.status !== 'completed' || rework.startedAt === null || rework.completedAt === null)
      invalid(['rework'], '返工完成结果必须保留已完成状态和开完工时间');
    if (
      rework.completedNormalReportId !== (normalReport?.reportId ?? null) ||
      rework.completedAbnormalReportId !== (abnormalReport?.reportId ?? null) ||
      (normalReport && abnormalReport && normalReport.reportId === abnormalReport.reportId)
    )
      invalid(['rework'], '返工完成引用必须分别指向实际生成的两类结果报工');
    const validSource = (report: NonNullable<CompleteReworkResult['normalReport']>): boolean =>
      report.productionBatchId === rework.productionBatchId &&
      report.stepRecordId === rework.stepRecordId &&
      report.unit === rework.unit &&
      report.reportId !== rework.sourceReportId &&
      report.reportType === 'normal' &&
      report.reversalOfReportId === null &&
      report.correctionOfReportId === null &&
      report.isEffective &&
      !report.canReverse &&
      !report.canCorrect;
    if (
      normalReport &&
      (!validSource(normalReport) ||
        Number(normalReport.normalQuantity) <= 0 ||
        normalReport.abnormalQuantity !== '0' ||
        normalReport.abnormalOrigin !== null ||
        normalReport.reportedQuantity !== normalReport.normalQuantity)
    )
      invalid(['normalReport'], '正常恢复结果必须是同源的正数纯正常报工');
    if (
      abnormalReport &&
      (!validSource(abnormalReport) ||
        Number(abnormalReport.abnormalQuantity) <= 0 ||
        abnormalReport.normalQuantity !== '0' ||
        abnormalReport.abnormalOrigin !== 'current_step' ||
        abnormalReport.reportedQuantity !== abnormalReport.abnormalQuantity)
    )
      invalid(['abnormalReport'], '返工残余异常结果必须是同源的正数纯异常报工');
    if (
      Number(rework.reworkQuantity) <= 0 ||
      Number(normalReport?.normalQuantity ?? '0') +
        Number(abnormalReport?.abnormalQuantity ?? '0') !==
        Number(rework.reworkQuantity)
    )
      invalid(['rework', 'reworkQuantity'], '两类结果数量必须完整覆盖返工数量');
    if (!abnormalReport) {
      if (abnormalDisposition) invalid(['abnormalDisposition'], '没有残余异常时不能生成异常处置单');
    } else if (
      !abnormalDisposition ||
      abnormalDisposition.sourceReportId !== abnormalReport.reportId ||
      abnormalDisposition.productionBatchId !== rework.productionBatchId ||
      abnormalDisposition.stepRecordId !== rework.stepRecordId ||
      abnormalDisposition.sourceAbnormalQuantity !== abnormalReport.abnormalQuantity ||
      abnormalDisposition.abnormalOrigin !== 'current_step' ||
      abnormalDisposition.reviewStatus !== 'pending_review' ||
      abnormalDisposition.dispositionType !== null
    )
      invalid(['abnormalDisposition'], '新待处置单必须只引用本次返工残余异常报工');
  }) satisfies z.ZodType<CompleteReworkResult>;

export const completeReworkResultCodec: IdempotencyResultCodec<CompleteReworkResult> = {
  encode: (value) => schema.parse(value),
  decode: (value) => schema.parse(value),
};
