import type { RowDataPacket } from 'mysql2/promise';
import type {
  PageResult,
  ProductionTrackingAbnormality,
  ProductionTrackingAbnormalityHandling,
  ProductionTrackingCardDetail,
  ProductionTrackingCardItem,
  ProductionTrackingCardQuery,
  ProductionTrackingOutput,
  ProductionTrackingQuantityChange,
  ProductionTrackingReportQuery,
  ProductionTrackingVisit,
  ProductionTrackingWorkbench,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';
import { selectBatchOverview } from '../tasks/mysql-production-batch.read.js';

const PERSON = `CAST(personnel_id AS CHAR) personnelId,personnel_code_snapshot personnelCode,personnel_name_snapshot personnelName`;
const CARD_SELECT = `SELECT CAST(c.id AS CHAR) id,c.card_no cardNo,CAST(c.production_batch_id AS CHAR) productionBatchId,
 b.batch_no batchNo,wo.work_order_no workOrderNo,wo.product_code_snapshot productCode,wo.product_name_snapshot productName,
 CAST(c.quantity AS CHAR) quantity,wo.unit_snapshot unit,c.status,CAST(c.current_step_record_id AS CHAR) currentStepRecordId,s.step_name_snapshot currentStepName,
 CAST(c.personnel_id AS CHAR) personnelId,c.personnel_code_snapshot personnelCode,c.personnel_name_snapshot personnelName,
 (SELECT COUNT(*) FROM production_tracking_abnormality a WHERE a.tracking_card_id=c.id AND a.status='open') openAbnormalityCount,
 EXISTS(SELECT 1 FROM production_tracking_abnormality a WHERE a.tracking_card_id=c.id AND a.status='open' AND a.severity='pause') isPaused,
 (SELECT CAST(o.quantity AS CHAR) FROM production_tracking_output o WHERE o.tracking_card_id=c.id) availableQuantity,
 c.remark,c.void_reason voidReason,c.voided_at voidedAt,c.created_at createdAt,c.version
 FROM production_tracking_card c JOIN production_batches b ON b.id=c.production_batch_id JOIN work_orders wo ON wo.id=b.work_order_id
 LEFT JOIN batch_step_records s ON s.id=c.current_step_record_id`;
const VISIT_SELECT = `SELECT CAST(v.id AS CHAR) id,CAST(v.tracking_card_id AS CHAR) trackingCardId,c.card_no cardNo,
 CAST(v.production_batch_id AS CHAR) productionBatchId,b.batch_no batchNo,CAST(v.batch_step_record_id AS CHAR) stepRecordId,
 s.step_order_snapshot stepOrder,s.step_code_snapshot stepCode,s.step_name_snapshot stepName,
 CAST(v.personnel_id AS CHAR) personnelId,v.personnel_code_snapshot personnelCode,v.personnel_name_snapshot personnelName,
 v.arrived_at arrivedAt,CAST(v.arrived_by AS CHAR) arrivedBy,v.completed_at completedAt,CAST(v.completed_by AS CHAR) completedBy,
 CAST(v.reported_quantity AS CHAR) reportedQuantity,wo.unit_snapshot unit
 FROM production_tracking_visit v JOIN production_tracking_card c ON c.id=v.tracking_card_id
 JOIN production_batches b ON b.id=v.production_batch_id JOIN work_orders wo ON wo.id=b.work_order_id
 JOIN batch_step_records s ON s.id=v.batch_step_record_id`;

function mapCard(row: RowDataPacket & ProductionTrackingCardItem): ProductionTrackingCardItem {
  return {
    ...row,
    quantity: String(row.quantity),
    openAbnormalityCount: Number(row.openAbnormalityCount),
    isPaused: Boolean(row.isPaused),
    availableQuantity: row.availableQuantity === null ? null : String(row.availableQuantity),
    createdAt: toBeijingISOString(row.createdAt),
    voidedAt: row.voidedAt === null ? null : toBeijingISOString(row.voidedAt),
  };
}
function mapVisit(row: RowDataPacket & ProductionTrackingVisit): ProductionTrackingVisit {
  return {
    ...row,
    stepOrder: Number(row.stepOrder),
    arrivedAt: toBeijingISOString(row.arrivedAt),
    completedAt: row.completedAt === null ? null : toBeijingISOString(row.completedAt),
    reportedQuantity: row.reportedQuantity === null ? null : String(row.reportedQuantity),
  };
}
export async function selectTrackingOutput(
  db: Db,
  batchId: string,
  cardId: string | null,
): Promise<ProductionTrackingOutput | null> {
  const [[row]] = await db.query<(RowDataPacket & ProductionTrackingOutput)[]>(
    `SELECT CAST(id AS CHAR) id,CAST(production_batch_id AS CHAR) productionBatchId,CAST(tracking_card_id AS CHAR) trackingCardId,CAST(quantity AS CHAR) quantity,${PERSON},CAST(confirmed_by AS CHAR) confirmedBy,confirmed_at confirmedAt,remark FROM production_tracking_output WHERE production_batch_id=? AND tracking_card_id <=> ?`,
    [batchId, cardId],
  );
  return row
    ? { ...row, quantity: String(row.quantity), confirmedAt: toBeijingISOString(row.confirmedAt) }
    : null;
}
export async function listTrackingCards(
  db: Db,
  query: ProductionTrackingCardQuery,
): Promise<PageResult<ProductionTrackingCardItem>> {
  const conditions = ['1=1'];
  const values: Array<string | number> = [];
  if (query.batchId) {
    conditions.push('c.production_batch_id=?');
    values.push(query.batchId);
  }
  if (query.status) {
    conditions.push('c.status=?');
    values.push(query.status);
  }
  if (query.stepRecordId) {
    conditions.push('c.current_step_record_id=?');
    values.push(query.stepRecordId);
  }
  if (query.abnormalityStatus) {
    conditions.push(
      'EXISTS(SELECT 1 FROM production_tracking_abnormality a WHERE a.tracking_card_id=c.id AND a.status=?)',
    );
    values.push(query.abnormalityStatus);
  }
  if (query.keyword) {
    conditions.push(
      '(c.card_no LIKE ? OR b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
    );
    values.push(...Array.from({ length: 5 }, () => `%${query.keyword}%`));
  }
  const where = conditions.join(' AND ');
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM production_tracking_card c JOIN production_batches b ON b.id=c.production_batch_id JOIN work_orders wo ON wo.id=b.work_order_id WHERE ${where}`,
    values,
  );
  const [rows] = await db.query<(RowDataPacket & ProductionTrackingCardItem)[]>(
    `${CARD_SELECT} WHERE ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapCard), total: Number(count?.total ?? 0), page, pageSize };
}
export async function selectTrackingCard(
  db: Db,
  id: string,
): Promise<ProductionTrackingCardDetail> {
  const [[card]] = await db.query<(RowDataPacket & ProductionTrackingCardItem)[]>(
    `${CARD_SELECT} WHERE c.id=?`,
    [id],
  );
  if (!card) throw new ProductionDomainError('NOT_FOUND', '追踪卡不存在');
  const [visits] = await db.query<(RowDataPacket & ProductionTrackingVisit)[]>(
    `${VISIT_SELECT} WHERE v.tracking_card_id=? ORDER BY s.step_order_snapshot,v.id`,
    [id],
  );
  const [changes] = await db.query<(RowDataPacket & ProductionTrackingQuantityChange)[]>(
    `SELECT CAST(id AS CHAR) id,CAST(previous_quantity AS CHAR) previousQuantity,CAST(quantity AS CHAR) quantity,reason,CAST(created_by AS CHAR) createdBy,created_at createdAt FROM production_tracking_quantity_change WHERE tracking_card_id=? ORDER BY id`,
    [id],
  );
  const [abnormalities] = await db.query<(RowDataPacket & ProductionTrackingAbnormality)[]>(
    `SELECT CAST(a.id AS CHAR) id,CAST(a.batch_step_record_id AS CHAR) stepRecordId,s.step_name_snapshot stepName,a.severity,a.status,a.description,CAST(a.personnel_id AS CHAR) personnelId,a.personnel_code_snapshot personnelCode,a.personnel_name_snapshot personnelName,CAST(a.created_by AS CHAR) createdBy,a.created_at createdAt,a.resolved_at resolvedAt,a.version FROM production_tracking_abnormality a LEFT JOIN batch_step_records s ON s.id=a.batch_step_record_id WHERE a.tracking_card_id=? ORDER BY a.id`,
    [id],
  );
  const [handlings] = await db.query<
    (RowDataPacket & ProductionTrackingAbnormalityHandling & { abnormalityId: string })[]
  >(
    `SELECT CAST(h.id AS CHAR) id,CAST(h.abnormality_id AS CHAR) abnormalityId,h.content,h.resolves_abnormality resolvesAbnormality,CAST(h.personnel_id AS CHAR) personnelId,h.personnel_code_snapshot personnelCode,h.personnel_name_snapshot personnelName,CAST(h.created_by AS CHAR) createdBy,h.created_at createdAt FROM production_tracking_abnormality_handling h JOIN production_tracking_abnormality a ON a.id=h.abnormality_id WHERE a.tracking_card_id=? ORDER BY h.id`,
    [id],
  );
  return {
    ...mapCard(card),
    visits: visits.map(mapVisit),
    quantityHistory: changes.map((row) => ({
      ...row,
      createdAt: toBeijingISOString(row.createdAt),
    })),
    abnormalities: abnormalities.map((row) => ({
      ...row,
      createdAt: toBeijingISOString(row.createdAt),
      resolvedAt: row.resolvedAt === null ? null : toBeijingISOString(row.resolvedAt),
      handlings: handlings
        .filter((h) => h.abnormalityId === row.id)
        .map(({ abnormalityId: _, ...h }) => ({
          ...h,
          resolvesAbnormality: Boolean(h.resolvesAbnormality),
          createdAt: toBeijingISOString(h.createdAt),
        })),
    })),
    output: await selectTrackingOutput(db, card.productionBatchId, id),
  };
}
export async function listTrackingReports(
  db: Db,
  query: ProductionTrackingReportQuery,
): Promise<PageResult<ProductionTrackingVisit>> {
  const conditions = ['v.completed_at IS NOT NULL'];
  const values: string[] = [];
  if (query.batchId) {
    conditions.push('v.production_batch_id=?');
    values.push(query.batchId);
  }
  if (query.stepRecordId) {
    conditions.push('v.batch_step_record_id=?');
    values.push(query.stepRecordId);
  }
  if (query.personnelId) {
    conditions.push('v.personnel_id=?');
    values.push(query.personnelId);
  }
  const where = conditions.join(' AND ');
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM production_tracking_visit v WHERE ${where}`,
    values,
  );
  const [rows] = await db.query<(RowDataPacket & ProductionTrackingVisit)[]>(
    `${VISIT_SELECT} WHERE ${where} ORDER BY v.completed_at DESC,v.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapVisit), total: Number(count?.total ?? 0), page, pageSize };
}
export async function selectTrackingWorkbench(
  db: Db,
  batchId: string,
): Promise<ProductionTrackingWorkbench> {
  const batch = await selectBatchOverview(db, batchId);
  const [steps] = await db.query<(RowDataPacket & ProductionTrackingWorkbench['steps'][number])[]>(
    `SELECT CAST(s.id AS CHAR) stepRecordId,s.step_order_snapshot stepOrder,s.step_code_snapshot stepCode,s.step_name_snapshot stepName,
 CASE WHEN s.actual_sop_object_key_snapshot IS NOT NULL THEN CAST(s.actual_sop_file_id AS CHAR) ELSE CAST(s.sop_file_id_snapshot AS CHAR) END sopFileId,
 CASE WHEN s.actual_sop_object_key_snapshot IS NOT NULL THEN s.actual_sop_file_name_snapshot ELSE s.sop_file_name_snapshot END sopFileName,
 CASE WHEN s.actual_sop_object_key_snapshot IS NOT NULL THEN s.actual_sop_version_no_snapshot ELSE s.sop_version_no_snapshot END sopVersionNo,
 (SELECT COUNT(*) FROM production_tracking_card c WHERE c.current_step_record_id=s.id AND c.status='in_progress') currentCardCount,
 (SELECT COUNT(*) FROM production_tracking_visit v WHERE v.batch_step_record_id=s.id AND v.completed_at IS NOT NULL) completedCardCount,
 CAST(COALESCE((SELECT SUM(v.reported_quantity) FROM production_tracking_visit v WHERE v.batch_step_record_id=s.id AND v.completed_at IS NOT NULL),0) AS CHAR) reportedQuantity
 FROM batch_step_records s WHERE s.production_batch_id=? ORDER BY s.step_order_snapshot,s.id`,
    [batchId],
  );
  const [[summary]] = await db.query<(RowDataPacket & ProductionTrackingWorkbench['summary'])[]>(
    `SELECT COUNT(*) totalCardCount,COALESCE(SUM(status='unused'),0) unusedCardCount,COALESCE(SUM(status='in_progress'),0) inProgressCardCount,COALESCE(SUM(status='completed'),0) completedCardCount,COALESCE(SUM(status='voided'),0) voidedCardCount,(SELECT COUNT(*) FROM production_tracking_abnormality a WHERE a.production_batch_id=? AND a.status='open') openAbnormalityCount,CAST(COALESCE((SELECT SUM(o.quantity) FROM production_tracking_output o WHERE o.production_batch_id=?),0) AS CHAR) availableQuantity FROM production_tracking_card WHERE production_batch_id=?`,
    [batchId, batchId, batchId],
  );
  if (!summary) throw new Error('追踪卡汇总缺失');
  return {
    batch,
    steps: steps.map((s) => ({
      ...s,
      currentCardCount: Number(s.currentCardCount),
      completedCardCount: Number(s.completedCardCount),
      reportedQuantity: String(s.reportedQuantity),
    })),
    summary: {
      totalCardCount: Number(summary.totalCardCount),
      unusedCardCount: Number(summary.unusedCardCount),
      inProgressCardCount: Number(summary.inProgressCardCount),
      completedCardCount: Number(summary.completedCardCount),
      voidedCardCount: Number(summary.voidedCardCount),
      openAbnormalityCount: Number(summary.openAbnormalityCount),
      availableQuantity: String(summary.availableQuantity),
    },
    researchOutput: await selectTrackingOutput(db, batchId, null),
  };
}
