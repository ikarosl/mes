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

type WorkspaceRecord = RowDataPacket & {
  markId: string;
  cardVersion: number;
  editableCard: number;
};

export async function listTrackingItemMarkWorkspaceRows(
  db: Db,
  query: ProductionTrackingItemMarkWorkspaceQuery,
): Promise<PageResult<ProductionTrackingItemMarkWorkspaceRow>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  if (!query.batchId && !query.cardId && !query.cardNo && !query.keyword)
    return { items: [], page, pageSize, total: 0 };

  const conditions = ["wo.order_type='mass_production'", 'm.occupied_mark_code IS NOT NULL'];
  const values: (string | number)[] = [];
  for (const [column, value] of [
    ['c.production_batch_id', query.batchId],
    ['c.id', query.cardId],
    ['c.card_no', query.cardNo],
  ] as const) {
    if (value) {
      conditions.push(`${column}=?`);
      values.push(value);
    }
  }
  if (query.keyword) {
    conditions.push('m.occupied_mark_code LIKE ?');
    values.push(`%${query.keyword}%`);
  }
  if (query.status) {
    conditions.push(
      `${TRACKING_EFFECTIVE_SCRAP_ABNORMALITY} IS ${query.status === 'scrapped' ? 'NOT ' : ''}NULL`,
    );
  }
  const matchingMarks = `FROM production_tracking_item_mark m
     JOIN production_tracking_card c ON c.id=m.tracking_card_id
     JOIN production_batches b ON b.id=c.production_batch_id
     JOIN work_orders wo ON wo.id=b.work_order_id
     ${query.status ? trackingEffectiveScrapJoins() : ''}
     WHERE ${conditions.join(' AND ')}`;
  const [[count]] = await db.query<(RowDataPacket & { total: number | string })[]>(
    `SELECT COUNT(*) total ${matchingMarks}`,
    values,
  );
  const offset = (page - 1) * pageSize;
  const total = Number(count?.total ?? 0);
  if (offset >= total) return { items: [], page, pageSize, total };

  const [records] = await db.query<WorkspaceRecord[]>(
    `SELECT CAST(m.id AS CHAR) markId,c.version cardVersion,
       (b.status='doing' AND c.status IN ('unused','in_progress') AND NOT EXISTS (
         SELECT 1 FROM production_tracking_output o
         LEFT JOIN production_tracking_output_cancellation x ON x.production_output_id=o.id
         WHERE o.tracking_card_id=c.id AND x.id IS NULL
       )) editableCard
     ${matchingMarks}
     ORDER BY ${query.keyword ? '(m.occupied_mark_code=?) DESC,' : ''}c.id DESC,m.id DESC
     LIMIT ? OFFSET ?`,
    [...values, ...(query.keyword ? [query.keyword] : []), pageSize, offset],
  );
  const marks = new Map(
    (
      await readTrackingItemMarksByIds(
        db,
        records.map((record) => record.markId),
      )
    ).map((item) => [item.id, item]),
  );
  const items = records.map(({ markId, cardVersion, editableCard }) => {
    const item = marks.get(markId);
    if (!item) throw new Error('单件刻码分页记录与详情不一致');
    return {
      trackingCardId: item.trackingCardId,
      cardNo: item.cardNo,
      productionBatchId: item.productionBatchId,
      cardVersion,
      canClear: Boolean(editableCard) && item.status === 'active' && !item.output,
      item,
    };
  });
  return { items, total, page, pageSize };
}
