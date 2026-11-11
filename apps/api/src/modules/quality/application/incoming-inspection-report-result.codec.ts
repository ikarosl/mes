import { z } from 'zod';
import {
  QUALITY_INBOUND_METHODS,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
  QUALITY_INCOMING_INSPECTION_REPORT_BATCH_MAX_LENGTH,
  QUALITY_INCOMING_INSPECTION_REPORT_HEADER_MAX_LENGTH,
} from '@company/constants';
import type { QualityIncomingInspectionReportItem } from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../common/idempotency/idempotency-executor.js';
import { normalizeIncomingInspectionDetails } from '../domain/incoming-inspection-report.policy.js';

const id = z.string().regex(/^[1-9]\d*$/);
const quantity = z.string().regex(/^(0|[1-9]\d{0,7})$/);
const note = z.string().max(QUALITY_INBOUND_TEXT_MAX_LENGTH).nullable();
const inspectionDetails = z.unknown().transform((value, context) => {
  try {
    const details = normalizeIncomingInspectionDetails(value);
    return {
      columns: details.columns.map((column) => ({ key: column.key, label: column.label })),
      rows: details.rows,
    };
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '检验记录表格无效' });
    return z.NEVER;
  }
});
const report = z
  .object({
    id,
    reportNo: z.string().min(1).max(64),
    receiptLineId: id,
    receiptId: id,
    receiptNo: z.string().min(1).max(100),
    purchaseNo: z.string().min(1).max(100),
    itemCode: z.string().min(1).max(100),
    itemName: z.string().min(1).max(200),
    materialVariantCode: z.string().min(1).max(180),
    unit: z.string().min(1).max(20),
    supplierName: z.string().min(1).max(100),
    specification: z.string().max(QUALITY_INCOMING_INSPECTION_REPORT_HEADER_MAX_LENGTH).nullable(),
    batchNo: z.string().max(QUALITY_INCOMING_INSPECTION_REPORT_BATCH_MAX_LENGTH).nullable(),
    expiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    inspectionMethod: z.enum(QUALITY_INBOUND_METHODS),
    qualifiedQuantity: quantity,
    unqualifiedQuantity: quantity,
    inspectedQuantity: quantity,
    previousRecordId: id.nullable(),
    correctedByRecordId: id.nullable(),
    inspectedAt: z.string().datetime({ offset: true }),
    remark: note,
    evidence: note,
    correctionReason: note,
    inspectionDetails,
    createdBy: id,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const incomingInspectionReportResultCodec = {
  encode: (value) => report.parse(value),
  decode: (value) => report.parse(value),
} satisfies IdempotencyResultCodec<QualityIncomingInspectionReportItem>;
