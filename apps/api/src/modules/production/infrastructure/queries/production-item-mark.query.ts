import type {
  PageResult,
  ProductionOutputInboundResult,
  ProductionTrackingItemMark,
  ProductionTrackingItemMarkCodeAvailability,
  ProductionTrackingItemMarkCorrection,
  ProductionTrackingItemMarkOutput,
  ProductionTrackingItemMarkQuery,
} from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';
import {
  TRACKING_EFFECTIVE_SCRAP_ABNORMALITY,
  trackingEffectiveScrapJoins,
} from '../tracking/tracking-effective-scrap.sql.js';
import { selectProductionOutputReceipts } from './production-output-inbound.query.js';

const MARK_COLUMNS = `CAST(m.id AS CHAR) id,CAST(c.id AS CHAR) trackingCardId,c.card_no cardNo,
 CAST(b.id AS CHAR) productionBatchId,b.batch_no batchNo,m.mark_code markCode,
 CONCAT(c.card_no,'-',m.mark_code) fullCode`;

export async function getItemMarkCodeAvailability(
  db: Db,
  markCode: string,
): Promise<ProductionTrackingItemMarkCodeAvailability> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id FROM production_tracking_item_mark WHERE occupied_mark_code=? LIMIT 1',
    [markCode],
  );
  return { markCode, available: rows.length === 0 };
}
const FACT_COLUMNS = `CAST(final_output.outputId AS CHAR) outputId,
 CAST(final_output.outputQuantity AS CHAR) outputQuantity,final_output.outputConfirmedAt,
 CAST(final_output.outputConfirmedBy AS CHAR) outputConfirmedBy,
 CAST(final_output.outputPersonnelId AS CHAR) outputPersonnelId,
 final_output.outputPersonnelCode,final_output.outputPersonnelName`;
const MARK_FACTS_SELECT = `SELECT ${MARK_COLUMNS},${FACT_COLUMNS},
 CASE WHEN m.occupied_mark_code IS NULL THEN 'cancelled' WHEN ${TRACKING_EFFECTIVE_SCRAP_ABNORMALITY} IS NOT NULL THEN 'scrapped' ELSE 'active' END status,
 CAST(m.personnel_id AS CHAR) personnelId,m.personnel_code_snapshot personnelCode,m.personnel_name_snapshot personnelName,
 CAST(m.created_by AS CHAR) createdBy,m.created_at createdAt,
 x.reason cancelReason,CAST(x.created_by AS CHAR) cancelledBy,x.created_at cancelledAt,
 CAST(COALESCE(original_scrap.handling_id,adjusted_handling.id) AS CHAR) handlingId,
 CAST(${TRACKING_EFFECTIVE_SCRAP_ABNORMALITY} AS CHAR) abnormalityId,
 COALESCE(original_scrap.created_at,adjusted_scrap.created_at) scrappedAt,
 m.version,(SELECT COUNT(*) FROM production_tracking_item_mark_correction mc WHERE mc.item_mark_id=m.id) correctionCount
 FROM production_tracking_item_mark m
 JOIN production_tracking_card c ON c.id=m.tracking_card_id
 JOIN production_batches b ON b.id=c.production_batch_id
 LEFT JOIN production_tracking_item_mark_cancellation x ON x.item_mark_id=m.id
 ${trackingEffectiveScrapJoins()}
 LEFT JOIN production_tracking_abnormality_handling adjusted_handling ON adjusted_handling.abnormality_id=adjusted_scrap.abnormality_id
 LEFT JOIN (
   SELECT om.item_mark_id,o.id outputId,o.tracking_card_id,o.production_batch_id,o.product_id,o.work_order_id,
    o.quantity outputQuantity,o.confirmed_at outputConfirmedAt,o.confirmed_by outputConfirmedBy,
    o.personnel_id outputPersonnelId,o.personnel_code_snapshot outputPersonnelCode,
    o.personnel_name_snapshot outputPersonnelName
   FROM production_tracking_output_item_mark om JOIN production_tracking_output o ON o.id=om.production_output_id
   LEFT JOIN production_tracking_output_cancellation ox ON ox.production_output_id=o.id WHERE ox.id IS NULL
 ) final_output ON final_output.item_mark_id=m.id AND final_output.tracking_card_id=c.id
   AND final_output.production_batch_id=c.production_batch_id
   AND final_output.product_id=b.product_id AND final_output.work_order_id=b.work_order_id`;

type MarkFactRow = RowDataPacket & {
  id: string;
  trackingCardId: string;
  cardNo: string;
  productionBatchId: string;
  batchNo: string;
  markCode: string;
  fullCode: string;
  outputId: string | null;
  outputQuantity: string | null;
  outputConfirmedAt: Date | null;
  outputConfirmedBy: string | null;
  outputPersonnelId: string | null;
  outputPersonnelCode: string | null;
  outputPersonnelName: string | null;
};
type MarkListRow = MarkFactRow & {
  status: ProductionTrackingItemMark['status'];
  personnelId: string;
  personnelCode: string;
  personnelName: string;
  createdBy: string;
  createdAt: Date;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  handlingId: string | null;
  abnormalityId: string | null;
  scrappedAt: Date | null;
  correctionCount: number | string;
  version: number;
};

function markOutput(row: MarkFactRow): ProductionTrackingItemMarkOutput | null {
  if (row.outputId === null) return null;
  if (
    row.outputQuantity === null ||
    row.outputConfirmedAt === null ||
    row.outputConfirmedBy === null ||
    row.outputPersonnelId === null ||
    row.outputPersonnelCode === null ||
    row.outputPersonnelName === null
  )
    throw new Error('单件刻码终检事实不完整');
  return {
    outputId: row.outputId,
    quantity: String(row.outputQuantity),
    confirmedAt: toBeijingISOString(row.outputConfirmedAt),
    confirmedBy: row.outputConfirmedBy,
    personnelId: row.outputPersonnelId,
    personnelCode: row.outputPersonnelCode,
    personnelName: row.outputPersonnelName,
  };
}

function mapItemMark(
  row: MarkListRow,
  outputReceipts: ProductionOutputInboundResult[],
): ProductionTrackingItemMark {
  return {
    id: row.id,
    trackingCardId: row.trackingCardId,
    cardNo: row.cardNo,
    productionBatchId: row.productionBatchId,
    batchNo: row.batchNo,
    markCode: row.markCode,
    fullCode: row.fullCode,
    status: row.status,
    personnelId: row.personnelId,
    personnelCode: row.personnelCode,
    personnelName: row.personnelName,
    createdBy: row.createdBy,
    createdAt: toBeijingISOString(row.createdAt),
    cancellation:
      row.cancelReason !== null && row.cancelledBy !== null && row.cancelledAt !== null
        ? {
            reason: row.cancelReason,
            createdBy: row.cancelledBy,
            createdAt: toBeijingISOString(row.cancelledAt),
          }
        : null,
    scrap:
      row.handlingId !== null && row.abnormalityId !== null && row.scrappedAt !== null
        ? {
            handlingId: row.handlingId,
            abnormalityId: row.abnormalityId,
            createdAt: toBeijingISOString(row.scrappedAt),
          }
        : null,
    correctionCount: Number(row.correctionCount),
    version: row.version,
    output: markOutput(row),
    outputReceipts,
  };
}

export async function listTrackingItemMarks(
  db: Db,
  query: ProductionTrackingItemMarkQuery,
  itemMarkId?: string,
): Promise<PageResult<ProductionTrackingItemMark>> {
  const conditions = ['1=1'];
  const values: Array<string | number> = [];
  for (const [value, column] of [
    [query.batchId, 'c.production_batch_id'],
    [query.cardId, 'c.id'],
    [query.cardNo, 'c.card_no'],
    [itemMarkId, 'm.id'],
  ] as const) {
    if (value) {
      conditions.push(`${column}=?`);
      values.push(value);
    }
  }
  if (
    !itemMarkId &&
    !query.status &&
    (query.keyword || (!query.cardId && !query.batchId && !query.cardNo))
  ) {
    conditions.push('m.occupied_mark_code IS NOT NULL');
  }
  if (query.keyword) {
    conditions.push('m.mark_code LIKE ?');
    values.push(`%${query.keyword}%`);
  }
  if (query.status === 'active')
    conditions.push(
      `m.occupied_mark_code IS NOT NULL AND ${TRACKING_EFFECTIVE_SCRAP_ABNORMALITY} IS NULL`,
    );
  if (query.status === 'cancelled') conditions.push('m.occupied_mark_code IS NULL');
  if (query.status === 'scrapped')
    conditions.push(
      `m.occupied_mark_code IS NOT NULL AND ${TRACKING_EFFECTIVE_SCRAP_ABNORMALITY} IS NOT NULL`,
    );
  const select = `${MARK_FACTS_SELECT} WHERE ${conditions.join(' AND ')}`;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM (${select}) matching_marks`,
    values,
  );
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const [rows] = await db.query<MarkListRow[]>(
    `${select} ORDER BY ${query.keyword ? '(m.mark_code=?) DESC,' : ''}m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`,
    [...values, ...(query.keyword ? [query.keyword] : []), pageSize, (page - 1) * pageSize],
  );
  return {
    items: await mapMarksWithReceipts(db, rows),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

async function mapMarksWithReceipts(
  db: Db,
  rows: MarkListRow[],
): Promise<ProductionTrackingItemMark[]> {
  const receipts = await selectProductionOutputReceipts(
    db,
    rows.flatMap((row) => (row.outputId === null ? [] : [row.outputId])),
  );
  return rows.map((row) =>
    mapItemMark(row, row.outputId === null ? [] : (receipts.get(row.outputId) ?? [])),
  );
}

export async function readTrackingItemMarksByIds(
  db: Db,
  ids: string[],
): Promise<ProductionTrackingItemMark[]> {
  if (ids.length === 0) return [];
  const [rows] = await db.query<MarkListRow[]>(`${MARK_FACTS_SELECT} WHERE m.id IN (?)`, [ids]);
  return mapMarksWithReceipts(db, rows);
}

export async function getTrackingItemMark(
  db: Db,
  cardId: string,
  markId: string,
): Promise<ProductionTrackingItemMark> {
  const { items } = await listTrackingItemMarks(db, { cardId, page: 1, pageSize: 1 }, markId);
  if (!items[0]) throw new ProductionDomainError('NOT_FOUND', '本卡不存在该单件刻码绑定');
  return items[0];
}

export async function listTrackingItemMarkCorrections(
  db: Db,
  cardId: string,
  markId: string,
  query: { page?: number; pageSize?: number },
): Promise<PageResult<ProductionTrackingItemMarkCorrection>> {
  const [[identity]] = await db.query<RowDataPacket[]>(
    'SELECT id FROM production_tracking_item_mark WHERE id=? AND tracking_card_id=?',
    [markId, cardId],
  );
  if (!identity) throw new ProductionDomainError('NOT_FOUND', '本卡不存在该单件刻码绑定');
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) total FROM production_tracking_item_mark_correction WHERE item_mark_id=?',
    [markId],
  );
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const [rows] = await db.query<
    (RowDataPacket &
      Omit<ProductionTrackingItemMarkCorrection, 'createdAt'> & { createdAt: Date })[]
  >(
    `SELECT CAST(id AS CHAR) id,CAST(item_mark_id AS CHAR) itemMarkId,previous_mark_code previousMarkCode,
     corrected_mark_code correctedMarkCode,reason,CAST(created_by AS CHAR) createdBy,created_at createdAt
     FROM production_tracking_item_mark_correction WHERE item_mark_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
    [markId, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => ({ ...row, createdAt: toBeijingISOString(row.createdAt) })),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
