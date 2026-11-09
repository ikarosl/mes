import { z } from 'zod';
import type {
  ProductionTrackingCardDetail,
  ProductionTrackingOutput,
  ProductionTrackingScanResult,
} from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

const id = z.string().regex(/^[1-9]\d*$/);
const time = z.string().datetime({ offset: true });
const quantity = z.string().regex(/^\d+$/);
const person = { personnelId: id, personnelCode: z.string(), personnelName: z.string() };
const output = z
  .object({
    ...person,
    id,
    productionBatchId: id,
    trackingCardId: id.nullable(),
    quantity,
    confirmedBy: id,
    confirmedAt: time,
    remark: z.string().nullable(),
  })
  .strict();
const handling = z
  .object({
    ...person,
    id,
    content: z.string(),
    resolvesAbnormality: z.boolean(),
    createdBy: id,
    createdAt: time,
  })
  .strict();
const abnormality = z
  .object({
    ...person,
    id,
    stepRecordId: id.nullable(),
    stepName: z.string().nullable(),
    severity: z.enum(['normal', 'pause']),
    status: z.enum(['open', 'resolved']),
    description: z.string(),
    createdBy: id,
    createdAt: time,
    resolvedAt: time.nullable(),
    version: z.number().int().nonnegative(),
    handlings: z.array(handling),
  })
  .strict();
const visit = z
  .object({
    ...person,
    id,
    trackingCardId: id,
    cardNo: z.string(),
    productionBatchId: id,
    batchNo: z.string(),
    stepRecordId: id,
    stepOrder: z.number().int(),
    stepCode: z.string(),
    stepName: z.string(),
    arrivedAt: time,
    arrivedBy: id,
    completedAt: time.nullable(),
    completedBy: id.nullable(),
    reportedQuantity: quantity.nullable(),
    unit: z.string(),
  })
  .strict();
const card = z
  .object({
    ...person,
    id,
    cardNo: z.string(),
    productionBatchId: id,
    batchNo: z.string(),
    workOrderNo: z.string(),
    productCode: z.string(),
    productName: z.string(),
    quantity,
    unit: z.string(),
    status: z.enum(['unused', 'in_progress', 'completed', 'voided']),
    currentStepRecordId: id.nullable(),
    currentStepName: z.string().nullable(),
    openAbnormalityCount: z.number().int().nonnegative(),
    isPaused: z.boolean(),
    availableQuantity: quantity.nullable(),
    remark: z.string().nullable(),
    voidReason: z.string().nullable(),
    voidedAt: time.nullable(),
    createdAt: time,
    version: z.number().int().nonnegative(),
    visits: z.array(visit),
    quantityHistory: z.array(
      z
        .object({
          id,
          previousQuantity: quantity,
          quantity,
          reason: z.string(),
          createdBy: id,
          createdAt: time,
        })
        .strict(),
    ),
    abnormalities: z.array(abnormality),
    output: output.nullable(),
  })
  .strict();
const scan = z.object({ card, duplicate: z.boolean(), completedVisitId: id.nullable() }).strict();

export const trackingCardResultCodec: IdempotencyResultCodec<ProductionTrackingCardDetail> = {
  encode: (value) => card.parse(value),
  decode: (value) => card.parse(value),
};
export const trackingOutputResultCodec: IdempotencyResultCodec<ProductionTrackingOutput> = {
  encode: (value) => output.parse(value),
  decode: (value) => output.parse(value),
};
export const trackingScanResultCodec: IdempotencyResultCodec<ProductionTrackingScanResult> = {
  encode: (value) => scan.parse(value),
  decode: (value) => scan.parse(value),
};
