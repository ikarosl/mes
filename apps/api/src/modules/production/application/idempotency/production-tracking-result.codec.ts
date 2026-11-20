import { z } from 'zod';
import {
  PRODUCTION_TRACKING_ABNORMALITY_SCRAP_MODES,
  PRODUCTION_TRACKING_CARD_BATCH_LIMIT,
} from '@company/constants';
import type {
  ProductionTrackingCardDetail,
  ProductionTrackingCardsCreatedResult,
  ProductionTrackingOutput,
  ProductionTrackingScanResult,
  SaveProductionTrackingItemMarkWorkspaceResult,
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
const legacyHandling = z
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
const scrappedItemMark = z.object({ itemMarkId: id, markCode: z.string() }).strict();
const adjustment = { reason: z.string(), createdBy: id, createdAt: time };
const scrapCorrection = z
  .object({
    ...adjustment,
    id,
    previousScrappedQuantity: quantity,
    scrappedQuantity: quantity,
    previousScrappedItemMarks: z.array(scrappedItemMark),
    scrappedItemMarks: z.array(scrappedItemMark),
  })
  .strict();
const handling = legacyHandling.extend({
  scrapMode: z.enum(PRODUCTION_TRACKING_ABNORMALITY_SCRAP_MODES),
  scrappedItemMarks: z.array(scrappedItemMark.extend({ markCode: z.string().nullable() })),
  currentScrappedQuantity: quantity,
  currentScrappedItemMarks: z.array(scrappedItemMark),
  corrections: z.array(scrapCorrection),
  voided: z.object(adjustment).strict().nullable(),
  canCorrectScrap: z.boolean(),
  scrapCorrectionBlockedReason: z.string().nullable(),
  canVoid: z.boolean(),
});
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
    handling: legacyHandling.nullable(),
  })
  .strict();
const labelledAbnormality = legacyAbnormality.extend({
  descriptionLabels: z.array(z.string()).min(1),
});
const abnormality = labelledAbnormality.extend({ handling: handling.nullable() });
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
const labelledCard = legacyCard.extend({
  abnormalityLabels: z.array(z.string()),
  abnormalities: z.array(labelledAbnormality),
});
const emptyItemMarking = {
  activeCount: 0,
  scrappedCount: 0,
  cancelledCount: 0,
  totalCount: 0,
};
const itemMarking = z
  .object({
    activeCount: z.number().int().nonnegative(),
    scrappedCount: z.number().int().nonnegative(),
    cancelledCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
  })
  .strict();
const markedCard = labelledCard.extend({ itemMarking });
const card = markedCard.extend({ abnormalities: z.array(abnormality) });
const switchedCard = labelledCard
  .extend({
    itemMarking: itemMarking.extend({ required: z.boolean() }),
  })
  .transform(({ itemMarking: { required: _legacyRequired, ...summary }, ...value }) => ({
    ...value,
    itemMarking: summary,
  }));
// Strictly recognize each published shape. Results predating item marking project
// zero counts; switched results only drop the obsolete flag. Older complete descriptions remain one label.
// Prior snapshots preserve the then-effective quantity without claiming any unavailable item
// identities or current command eligibility.
const priorCard = z
  .union([
    markedCard,
    switchedCard,
    labelledCard.transform((value) => ({ ...value, itemMarking: { ...emptyItemMarking } })),
    legacyCard.transform((value) => ({
      ...value,
      itemMarking: { ...emptyItemMarking },
      abnormalityLabels: [...new Set(value.abnormalities.map((row) => row.description))],
      abnormalities: value.abnormalities.map((row) => ({
        ...row,
        descriptionLabels: [row.description],
      })),
    })),
  ])
  .transform((value) => ({
    ...value,
    abnormalities: value.abnormalities.map((abnormality) => ({
      ...abnormality,
      handling: abnormality.handling
        ? {
            ...abnormality.handling,
            scrapMode: 'unknown' as const,
            scrappedItemMarks: null,
            currentScrappedQuantity: abnormality.handling.scrappedQuantity,
            currentScrappedItemMarks: null,
            corrections: [],
            voided: null,
            canCorrectScrap: false,
            scrapCorrectionBlockedReason: null,
            canVoid: false,
          }
        : null,
    })),
  }));
const compatibleCard = z.union([card, priorCard]);
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
const savedMarks = z.object({ changedCount: z.number().int().positive() }).strict();
export const savedMarksResultCodec: IdempotencyResultCodec<SaveProductionTrackingItemMarkWorkspaceResult> =
  {
    encode: (value) => savedMarks.parse(value),
    decode: (value) => savedMarks.parse(value),
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
