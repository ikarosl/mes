import type { RowDataPacket } from 'mysql2/promise';
import type {
  ProductionTrackingAbnormalityHandling,
  ProductionTrackingAbnormalityScrapCorrection,
  ProductionTrackingAbnormalityScrapMode,
  ProductionTrackingAbnormalityScrappedItemMark,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import type { Db } from '../shared/mysql-production-db.js';
import {
  trackingAdjustmentBlockedReason,
  UNKNOWN_TRACKING_SCRAP_MODE_REASON,
} from './mysql-production-tracking-abnormality-adjustment.js';

type HandlingRow = RowDataPacket &
  Pick<
    ProductionTrackingAbnormalityHandling,
    'id' | 'content' | 'personnelId' | 'personnelCode' | 'personnelName' | 'createdBy'
  > & {
    abnormalityId: string;
    repairedQuantity: number;
    scrappedQuantity: number;
    scrapMode: Exclude<ProductionTrackingAbnormalityScrapMode, 'unknown'> | null;
    createdAt: Date;
  };

type AdjustmentRow = RowDataPacket & {
  id: string;
  abnormalityId: string;
  version: number;
  kind: 'correct' | 'void';
  previousScrappedQuantity: number;
  scrappedQuantity: number;
  reason: string;
  createdBy: string;
  createdAt: Date;
};

type AdjustmentMarkRow = RowDataPacket &
  ProductionTrackingAbnormalityScrappedItemMark & {
    adjustmentId: string;
    setKind: 'before' | 'after';
    currentMarkCode: string;
  };

function groupRows<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    const group = groups.get(groupKey);
    if (group) group.push(row);
    else groups.set(groupKey, [row]);
  }
  return groups;
}

export async function selectTrackingAbnormalityHandlings(
  db: Db,
  cardId: string,
  cardBlockedReason: string | null,
  lock: boolean,
): Promise<Map<string, { handling: ProductionTrackingAbnormalityHandling; version?: number }>> {
  const suffix = lock ? ' FOR SHARE' : '';
  const [handlings] = await db.query<HandlingRow[]>(
    `SELECT CAST(h.id AS CHAR) id,CAST(h.abnormality_id AS CHAR) abnormalityId,h.content,
     h.repaired_quantity repairedQuantity,h.scrapped_quantity scrappedQuantity,h.scrap_mode scrapMode,
     CAST(h.personnel_id AS CHAR) personnelId,h.personnel_code_snapshot personnelCode,
     h.personnel_name_snapshot personnelName,CAST(h.created_by AS CHAR) createdBy,h.created_at createdAt
     FROM production_tracking_abnormality_handling h
     JOIN production_tracking_abnormality a ON a.id=h.abnormality_id
     WHERE a.tracking_card_id=? ORDER BY h.id${suffix}`,
    [cardId],
  );
  if (handlings.length === 0) return new Map();
  const [references] = await db.query<
    (RowDataPacket & { ownerHandlingId: string; handlingId: string; quantity: string })[]
  >(
    `SELECT CAST(r.handling_id AS CHAR) ownerHandlingId,
     CAST(r.referenced_handling_id AS CHAR) handlingId,CAST(r.quantity AS CHAR) quantity
     FROM production_tracking_scrap_reference r
     JOIN production_tracking_abnormality_handling h ON h.id=r.handling_id
     JOIN production_tracking_abnormality a ON a.id=h.abnormality_id
     WHERE a.tracking_card_id=? ORDER BY r.handling_id,r.referenced_handling_id${suffix}`,
    [cardId],
  );
  const [originalMarks] = await db.query<
    (RowDataPacket & {
      handlingId: string;
      itemMarkId: string;
      markCode: string | null;
      currentMarkCode: string;
    })[]
  >(
    `SELECT CAST(h.id AS CHAR) handlingId,CAST(s.item_mark_id AS CHAR) itemMarkId,
     s.mark_code_snapshot markCode,m.mark_code currentMarkCode
     FROM production_tracking_abnormality_handling h
     JOIN production_tracking_abnormality a ON a.id=h.abnormality_id
     JOIN production_tracking_item_mark_scrap s ON s.handling_id=h.id
     JOIN production_tracking_item_mark m ON m.id=s.item_mark_id
     WHERE a.tracking_card_id=? ORDER BY h.id,s.item_mark_id${suffix}`,
    [cardId],
  );
  const [adjustments] = await db.query<AdjustmentRow[]>(
    `SELECT CAST(d.id AS CHAR) id,CAST(d.abnormality_id AS CHAR) abnormalityId,d.version,d.kind,
     d.previous_scrapped_quantity previousScrappedQuantity,d.scrapped_quantity scrappedQuantity,
     d.reason,CAST(d.created_by AS CHAR) createdBy,d.created_at createdAt
     FROM production_tracking_abnormality_adjustment d
     JOIN production_tracking_abnormality a ON a.id=d.abnormality_id
     WHERE a.tracking_card_id=? ORDER BY d.abnormality_id,d.version${suffix}`,
    [cardId],
  );
  const [adjustmentMarks] = await db.query<AdjustmentMarkRow[]>(
    `SELECT CAST(l.adjustment_id AS CHAR) adjustmentId,l.set_kind setKind,
     CAST(l.item_mark_id AS CHAR) itemMarkId,l.mark_code_snapshot markCode,m.mark_code currentMarkCode
     FROM production_tracking_abnormality_adjustment_item_mark l
     JOIN production_tracking_abnormality_adjustment d ON d.id=l.adjustment_id
     JOIN production_tracking_abnormality a ON a.id=d.abnormality_id
     JOIN production_tracking_item_mark m ON m.id=l.item_mark_id
     WHERE a.tracking_card_id=? ORDER BY l.adjustment_id,l.set_kind,l.item_mark_id${suffix}`,
    [cardId],
  );
  const previousMarksByAdjustment = groupRows(
    adjustmentMarks.filter((row) => row.setKind === 'before'),
    (row) => row.adjustmentId,
  );
  const currentMarksByAdjustment = groupRows(
    adjustmentMarks.filter((row) => row.setKind === 'after'),
    (row) => row.adjustmentId,
  );
  const originalMarksByHandling = groupRows(originalMarks, (row) => row.handlingId);
  const adjustmentsByAbnormality = groupRows(adjustments, (row) => row.abnormalityId);
  const referencesByHandling = groupRows(references, (row) => row.ownerHandlingId);
  const handlingIdsWithReferences = new Set(
    references.flatMap(({ handlingId, ownerHandlingId }) => [handlingId, ownerHandlingId]),
  );

  return new Map(
    handlings.map(
      ({ abnormalityId, repairedQuantity, scrappedQuantity, scrapMode, ...handling }) => {
        const history = adjustmentsByAbnormality.get(abnormalityId) ?? [];
        const latest = history.at(-1);
        const voided =
          latest?.kind === 'void'
            ? {
                reason: latest.reason,
                createdBy: latest.createdBy,
                createdAt: toBeijingISOString(latest.createdAt),
              }
            : null;
        const originals = originalMarksByHandling.get(handling.id) ?? [];
        const currentMarks = latest ? (currentMarksByAdjustment.get(latest.id) ?? []) : originals;
        const currentScrappedQuantity = latest?.scrappedQuantity ?? scrappedQuantity;
        const scrapReferences = (referencesByHandling.get(handling.id) ?? []).map(
          ({ handlingId, quantity }) => ({ handlingId, quantity }),
        );
        const blocked =
          trackingAdjustmentBlockedReason(
            repairedQuantity,
            scrappedQuantity,
            handlingIdsWithReferences.has(handling.id),
            voided !== null,
          ) ?? cardBlockedReason;
        const unknownModeReason = scrapMode === null ? UNKNOWN_TRACKING_SCRAP_MODE_REASON : null;
        const scrapCorrectionBlockedReason =
          scrappedQuantity > 0 ? (blocked ?? unknownModeReason) : null;
        const corrections: ProductionTrackingAbnormalityScrapCorrection[] = history
          .filter((row) => row.kind === 'correct')
          .map(
            ({
              id,
              previousScrappedQuantity,
              scrappedQuantity: correctedQuantity,
              reason,
              createdBy,
              createdAt,
            }) => ({
              id,
              previousScrappedQuantity: String(previousScrappedQuantity),
              scrappedQuantity: String(correctedQuantity),
              previousScrappedItemMarks: (previousMarksByAdjustment.get(id) ?? []).map(
                ({ itemMarkId, markCode }) => ({ itemMarkId, markCode }),
              ),
              scrappedItemMarks: (currentMarksByAdjustment.get(id) ?? []).map(
                ({ itemMarkId, markCode }) => ({ itemMarkId, markCode }),
              ),
              reason,
              createdBy,
              createdAt: toBeijingISOString(createdAt),
            }),
          );
        return [
          abnormalityId,
          {
            version: latest?.version,
            handling: {
              ...handling,
              createdAt: toBeijingISOString(handling.createdAt),
              repairedQuantity: String(repairedQuantity),
              scrappedQuantity: String(scrappedQuantity),
              scrapMode: scrapMode ?? 'unknown',
              scrapReferences,
              scrappedItemMarks: originals.map(({ itemMarkId, markCode }) => ({
                itemMarkId,
                markCode,
              })),
              currentScrappedQuantity: String(currentScrappedQuantity),
              currentScrappedItemMarks: currentMarks.map(({ itemMarkId, currentMarkCode }) => ({
                itemMarkId,
                markCode: currentMarkCode,
              })),
              corrections,
              voided,
              canCorrectScrap: currentScrappedQuantity > 0 && scrapCorrectionBlockedReason === null,
              scrapCorrectionBlockedReason,
              canVoid: blocked === null,
            },
          },
        ];
      },
    ),
  );
}
