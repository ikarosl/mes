import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  PageQuery,
  PageResult,
  ProcessInspectionDispositionHistoryItem,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { readProductionSnapshot } from '../shared/mysql-production-read-snapshot.js';
import { mapDisposition, type DispositionRow } from './mysql-production-reporting.projection.js';
import {
  mapReworkView,
  REWORK_VIEW_FIELDS,
  REWORK_VIEW_JOINS,
  type ReworkViewRow,
} from './mysql-production-report-trace.read.js';

type InspectionDispositionRow = DispositionRow & {
  source_type: 'process_inspection';
  batch_step_report_id: null;
  process_inspection_id: number;
  process_inspection_record_id: number;
  unit_snapshot: string;
  created_by: number;
  reviewed_by: number | null;
  reviewed_at: Date | null;
};

export async function requireProcessInspectionStep(
  db: Pool | PoolConnection,
  batchId: string,
  stepId: string,
): Promise<void> {
  const [[step]] = await db.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM batch_step_records WHERE production_batch_id=? AND id=?',
    [batchId, stepId],
  );
  if (!step) throw new ProductionDomainError('NOT_FOUND', '任务工序不存在');
}

/** 仅分页实际专检处理根；返工后的再次异常不作为另一笔专检处理重复列入。 */
export function listProcessInspectionDispositions(
  pool: Pool,
  batchId: string,
  stepId: string,
  query: PageQuery,
): Promise<PageResult<ProcessInspectionDispositionHistoryItem>> {
  return readProductionSnapshot(pool, async (db) => {
    await requireProcessInspectionStep(db, batchId, stepId);
    const page = query.page ?? 1,
      pageSize = query.pageSize ?? 10;
    const where = `WHERE d.production_batch_id=? AND d.batch_step_record_id=?
      AND d.source_type='process_inspection'`;
    const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM batch_step_abnormal_dispositions d ${where}`,
      [batchId, stepId],
    );
    const [rows] = await db.query<InspectionDispositionRow[]>(
      `SELECT d.id,d.disposition_no,d.production_batch_id,d.batch_step_record_id,
        d.batch_step_report_id,d.source_type,d.process_inspection_id,d.process_inspection_record_id,
        'current_step' abnormal_origin,d.inspection_quantity source_abnormal_quantity,
        d.review_status,d.disposition_type,d.remark,d.version,d.created_at,
        d.unit_snapshot,d.created_by,d.reviewed_by,d.reviewed_at
       FROM batch_step_abnormal_dispositions d ${where}
       ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`,
      [batchId, stepId, pageSize, (page - 1) * pageSize],
    );
    const reworks = new Map<string, ProcessInspectionDispositionHistoryItem['rework']>();
    if (rows.length) {
      const [reworkRows] = await db.query<ReworkViewRow[]>(
        `SELECT ${REWORK_VIEW_FIELDS} FROM rework_records rw ${REWORK_VIEW_JOINS}
         WHERE rw.production_batch_id=? AND rw.batch_step_record_id=?
           AND rw.abnormal_disposition_id IN (${rows.map(() => '?').join(',')})`,
        [batchId, stepId, ...rows.map((row) => row.id)],
      );
      for (const row of reworkRows) {
        reworks.set(String(row.abnormal_disposition_id), mapReworkView(row));
      }
    }
    return {
      items: rows.map((row) => ({
        ...mapDisposition(row),
        sourceType: row.source_type,
        sourceReportId: null,
        processInspectionId: String(row.process_inspection_id),
        processInspectionRecordId: String(row.process_inspection_record_id),
        unit: row.unit_snapshot,
        createdBy: String(row.created_by),
        createdByName: null,
        reviewedBy: row.reviewed_by === null ? null : String(row.reviewed_by),
        reviewedByName: null,
        reviewedAt: row.reviewed_at === null ? null : toBeijingISOString(row.reviewed_at),
        rework: reworks.get(String(row.id)) ?? null,
      })),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  });
}
