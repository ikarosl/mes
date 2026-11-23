import type {
  PageResult,
  ProductionTrackingItemMarkWorkspaceQuery,
  ProductionTrackingItemMarkWorkspaceRow,
} from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import type { Db } from '../shared/mysql-production-db.js';
import {
  TRACKING_EFFECTIVE_SCRAP_ABNORMALITY,
  trackingEffectiveScrapJoins,
} from '../tracking/tracking-effective-scrap.sql.js';
import { readTrackingItemMarksByIds } from './production-item-mark.query.js';

type WorkspaceRange = RowDataPacket & {
  trackingCardId: string | null;
  cardNo: string;
  productionBatchId: string;
  cardVersion: number;
  canBind: number;
  canClear: number;
  markId: string | null;
  firstPosition: number | string;
  lastPosition: number | string;
  total: number | string;
};

/** Each card's pending places occupy one SQL range, even for a very large batch. */
export async function listTrackingItemMarkWorkspaceRows(
  db: Db,
  query: ProductionTrackingItemMarkWorkspaceQuery,
): Promise<PageResult<ProductionTrackingItemMarkWorkspaceRow>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  if (!query.batchId && !query.cardId && !query.cardNo && !query.keyword)
    return { items: [], page, pageSize, total: 0 };

  const scope = ["wo.order_type='mass_production'"];
  const values: (string | number)[] = [];
  for (const [column, value] of [
    ['c.production_batch_id', query.batchId],
    ['c.id', query.cardId],
    ['c.card_no', query.cardNo],
  ] as const) {
    if (value) {
      scope.push(`${column}=?`);
      values.push(value);
    }
  }
  const includePending = !query.keyword && (!query.status || query.status === 'pending');
  const markFilter: string[] = [];
  if (query.keyword) {
    markFilter.push('markCode LIKE ?');
  }
  if (query.status === 'pending') markFilter.push('FALSE');
  if (query.status === 'active') markFilter.push('scrapped=0');
  if (query.status === 'scrapped') markFilter.push('scrapped=1');
  const pendingRange = `UNION ALL
    SELECT c.id,NULL,0,GREATEST(0, c.quantity - CAST(COUNT(m.markId) AS SIGNED))
    FROM cards c LEFT JOIN marks m ON m.cardId=c.id AND m.scrapped=0
    WHERE c.editableCard=1
    GROUP BY c.id,c.quantity`;
  const [ranges] = await db.query<WorkspaceRange[]>(
    `WITH cards AS (
       SELECT c.id,c.card_no,c.production_batch_id,c.version,c.quantity,
         (b.status='doing' AND c.status IN ('unused','in_progress') AND NOT EXISTS (
            SELECT 1 FROM production_tracking_output o LEFT JOIN production_tracking_output_cancellation x ON x.production_output_id=o.id
            WHERE o.tracking_card_id=c.id AND x.id IS NULL
         )) editableCard,
         NOT EXISTS (SELECT 1 FROM production_tracking_abnormality a WHERE a.tracking_card_id=c.id AND a.status='open') noOpen
       FROM production_tracking_card c JOIN production_batches b ON b.id=c.production_batch_id
       JOIN work_orders wo ON wo.id=b.work_order_id WHERE ${scope.join(' AND ')}
     ), marks AS (
       SELECT m.id markId,c.id cardId,m.occupied_mark_code markCode,
         (${TRACKING_EFFECTIVE_SCRAP_ABNORMALITY} IS NOT NULL) scrapped
       FROM cards c JOIN production_tracking_item_mark m ON m.tracking_card_id=c.id
       ${trackingEffectiveScrapJoins()}
       WHERE m.occupied_mark_code IS NOT NULL
     ), entries AS (
       SELECT cardId,markId,${query.keyword ? '(markCode=?)' : '0'} exactMatch,1 size
       FROM marks ${markFilter.length ? 'WHERE ' + markFilter.join(' AND ') : ''}
       ${includePending ? pendingRange : ''}
     ), positions AS (
       SELECT cardId,markId,size,
         SUM(size) OVER (ORDER BY exactMatch DESC,cardId DESC,markId DESC ROWS UNBOUNDED PRECEDING) lastPosition
       FROM entries WHERE size>0
     )
     SELECT CAST(c.id AS CHAR) trackingCardId,c.card_no cardNo,CAST(c.production_batch_id AS CHAR) productionBatchId,
       c.version cardVersion,c.editableCard canClear,(c.editableCard AND c.noOpen) canBind,
       CAST(p.markId AS CHAR) markId,p.lastPosition-p.size firstPosition,p.lastPosition,totals.total
     FROM (SELECT COALESCE(MAX(lastPosition),0) total FROM positions) totals
     LEFT JOIN positions p ON p.lastPosition>? AND p.lastPosition-p.size<?
     LEFT JOIN cards c ON c.id=p.cardId
     ORDER BY p.lastPosition`,
    [...values, ...(query.keyword ? [query.keyword, `%${query.keyword}%`] : []), start, end],
  );
  const marks = new Map(
    (
      await readTrackingItemMarksByIds(
        db,
        ranges.flatMap((r) => (r.markId ? [r.markId] : [])),
      )
    ).map((item) => [item.id, item]),
  );
  const items: ProductionTrackingItemMarkWorkspaceRow[] = [];
  for (const range of ranges) {
    if (!range.trackingCardId) continue;
    const card = {
      trackingCardId: range.trackingCardId,
      cardNo: range.cardNo,
      productionBatchId: range.productionBatchId,
      cardVersion: range.cardVersion,
      canBind: Boolean(range.canBind),
    };
    if (range.markId) {
      const item = marks.get(range.markId);
      if (!item) throw new Error('单件刻码分页记录与详情不一致');
      items.push({
        ...card,
        item,
        slot: null,
        canClear: Boolean(range.canClear) && item.status === 'active' && !item.output,
      });
    } else {
      const first = Number(range.firstPosition);
      const limit = Math.min(end, Number(range.lastPosition));
      for (let index = Math.max(start, first); index < limit; index++)
        items.push({ ...card, item: null, slot: index - first + 1, canClear: false });
    }
  }
  return { items, total: Number(ranges[0]?.total ?? 0), page, pageSize };
}
