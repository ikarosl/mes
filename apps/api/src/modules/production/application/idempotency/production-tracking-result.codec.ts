import { z } from 'zod';
import { PRODUCTION_TRACKING_CARD_BATCH_LIMIT } from '@company/constants';
import type {
  ProductionTrackingCardDetail,
  ProductionTrackingCardsCreatedResult,
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
    repairedQuantity: quantity,
    scrappedQuantity: quantity,
    scrapReferences: z.array(z.object({ handlingId: id, quantity }).strict()),
    createdBy: id,
    createdAt: time,
  })
  .strict();
const legacyAbnormality = z
  .object({
    ...person,
    id,
    stepRecordId: id.nullable(),
    stepName: z.string().nullable(),
    affectedQuantity: quantity,
    status: z.enum(['open', 'resolved']),
    description: z.string(),
    createdBy: id,
    createdAt: time,
    resolvedAt: time.nullable(),
    version: z.number().int().nonnegative(),
    handling: handling.nullable(),
  })
  .strict();
const abnormality = legacyAbnormality.extend({ descriptionLabels: z.array(z.string()).min(1) });
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
const legacyCard = z
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
    status: z.enum(['unused', 'in_progress', 'completed', 'scrapped', 'voided']),
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
    abnormalities: z.array(legacyAbnormality),
    output: output.nullable(),
  })
  .strict();
const card = legacyCard.extend({
  abnormalityLabels: z.array(z.string()),
  abnormalities: z.array(abnormality),
});
// A legacy result has no label fields anywhere and is strictly parsed before projection.
// Each complete original description is one label, matching the additive migration.
// Never split old text, invent label IDs or read the card's current database state.
const compatibleCard = z.union([
  card,
  legacyCard.transform((value) => ({
    ...value,
    abnormalityLabels: [...new Set(value.abnormalities.map((row) => row.description))],
    abnormalities: value.abnormalities.map((row) => ({
      ...row,
      descriptionLabels: [row.description],
    })),
  })),
]);
const scan = z.object({ card, duplicate: z.boolean(), completedVisitId: id.nullable() }).strict();
const compatibleScan = z
  .object({ card: compatibleCard, duplicate: z.boolean(), completedVisitId: id.nullable() })
  .strict();
const createdCards = z
  .object({ cards: z.array(card).min(1).max(PRODUCTION_TRACKING_CARD_BATCH_LIMIT) })
  .strict();
const compatibleCreatedCards = z
  .object({ cards: z.array(compatibleCard).min(1).max(PRODUCTION_TRACKING_CARD_BATCH_LIMIT) })
  .strict();

export const trackingCardResultCodec: IdempotencyResultCodec<ProductionTrackingCardDetail> = {
  encode: (value) => card.parse(value),
  decode: (value) => compatibleCard.parse(value),
};
export const trackingCardsCreatedResultCodec: IdempotencyResultCodec<ProductionTrackingCardsCreatedResult> =
  {
    encode: (value) => createdCards.parse(value),
    decode: (value) => compatibleCreatedCards.parse(value),
  };
export const trackingOutputResultCodec: IdempotencyResultCodec<ProductionTrackingOutput> = {
  encode: (value) => output.parse(value),
  decode: (value) => output.parse(value),
};
export const trackingScanResultCodec: IdempotencyResultCodec<ProductionTrackingScanResult> = {
  encode: (value) => scan.parse(value),
  decode: (value) => compatibleScan.parse(value),
};
