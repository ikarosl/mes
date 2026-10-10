import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepAbnormalDispositionView,
  BatchStepReportDependencyView,
  BatchStepReportItem,
  BatchStepReportProcessingChainItem,
  BatchStepReportReference,
  BatchStepReportSourceKind,
  BatchStepReportView,
  ReworkRecordView,
} from '@company/contracts';
import { integerQuantity } from '../domain/integer-quantity.js';
import {
  mapDisposition,
  type DispositionRow,
  type ReportRow,
} from './mysql-production-reporting.projection.js';
import { REPORT_FIELDS } from './mysql-production-reporting.persistence.js';
import { mapRework, REWORK_COLUMNS, type ReworkRow } from './mysql-production-rework.projection.js';

type Db = Pool | PoolConnection;

export type ReportViewRow = ReportRow & {
  reversal_of_report_no: string | null;
  correction_of_report_no: string | null;
  reversal_report_id: number | null;
  reversal_report_no: string | null;
  replacement_report_id: number | null;
  replacement_report_no: string | null;
};

type DispositionViewRow = DispositionRow & {
  source_report_no: string;
  source_report_type: ReportRow['report_type'];
  source_normal_quantity: string;
  source_rework_id: number | null;
};

export type ReworkViewRow = ReworkRow & {
  abnormal_disposition_no: string;
  source_report_no: string;
  completed_normal_report_no: string | null;
  completed_abnormal_report_no: string | null;
  completed_normal_quantity: string | null;
  completed_abnormal_quantity: string | null;
};

/** 关联唯一约束保证每个报工仍只产生一行，不改变分页粒度。 */
export const REPORT_VIEW_SELECT = `SELECT ${REPORT_FIELDS},
  original.report_no reversal_of_report_no,corrected.report_no correction_of_report_no,
  reversal.id reversal_report_id,reversal.report_no reversal_report_no,
  replacement.id replacement_report_id,replacement.report_no replacement_report_no
  FROM batch_step_reports r
  LEFT JOIN batch_step_reports original ON original.id=r.reversal_of_report_id
    AND original.production_batch_id=r.production_batch_id AND original.batch_step_record_id=r.batch_step_record_id
  LEFT JOIN batch_step_reports corrected ON corrected.id=r.replaces_report_id
    AND corrected.production_batch_id=r.production_batch_id AND corrected.batch_step_record_id=r.batch_step_record_id
  LEFT JOIN batch_step_reports reversal ON reversal.reversal_of_report_id=r.id
    AND reversal.production_batch_id=r.production_batch_id AND reversal.batch_step_record_id=r.batch_step_record_id
  LEFT JOIN batch_step_reports replacement ON replacement.replaces_report_id=r.id
    AND replacement.production_batch_id=r.production_batch_id AND replacement.batch_step_record_id=r.batch_step_record_id`;

export const REWORK_VIEW_FIELDS = `${REWORK_COLUMNS},d.disposition_no abnormal_disposition_no,
  source_report.report_no source_report_no,
  completed_normal_report.report_no completed_normal_report_no,
  completed_abnormal_report.report_no completed_abnormal_report_no,
  completed_normal_report.normal_quantity completed_normal_quantity,
  completed_abnormal_report.abnormal_quantity completed_abnormal_quantity`;

export const REWORK_VIEW_JOINS = `
  JOIN batch_step_abnormal_dispositions d ON d.id=rw.abnormal_disposition_id
    AND d.production_batch_id=rw.production_batch_id AND d.batch_step_record_id=rw.batch_step_record_id
    AND d.batch_step_report_id=rw.source_report_id
  JOIN batch_step_reports source_report ON source_report.id=rw.source_report_id
    AND source_report.production_batch_id=rw.production_batch_id AND source_report.batch_step_record_id=rw.batch_step_record_id
  LEFT JOIN batch_step_reports completed_normal_report ON completed_normal_report.id=rw.completed_normal_report_id
    AND completed_normal_report.production_batch_id=rw.production_batch_id AND completed_normal_report.batch_step_record_id=rw.batch_step_record_id
  LEFT JOIN batch_step_reports completed_abnormal_report ON completed_abnormal_report.id=rw.completed_abnormal_report_id
    AND completed_abnormal_report.production_batch_id=rw.production_batch_id AND completed_abnormal_report.batch_step_record_id=rw.batch_step_record_id`;

const DISPOSITION_VIEW_SELECT = `SELECT d.id,d.disposition_no,d.production_batch_id,
  d.batch_step_record_id,d.batch_step_report_id,source_report.abnormal_origin,
  source_report.abnormal_quantity source_abnormal_quantity,d.review_status,d.disposition_type,
  d.remark,d.version,d.created_at,source_report.report_no source_report_no,
  source_report.report_type source_report_type,source_report.normal_quantity source_normal_quantity,
  source_rework.id source_rework_id
  FROM batch_step_abnormal_dispositions d
  JOIN batch_step_reports source_report ON source_report.id=d.batch_step_report_id
    AND source_report.production_batch_id=d.production_batch_id AND source_report.batch_step_record_id=d.batch_step_record_id
  LEFT JOIN rework_records source_rework ON
    (source_rework.completed_normal_report_id=source_report.id OR source_rework.completed_abnormal_report_id=source_report.id)
    AND source_rework.production_batch_id=d.production_batch_id AND source_rework.batch_step_record_id=d.batch_step_record_id`;

export function reportSourceKind(
  type: ReportRow['report_type'],
  normalQuantity: string,
  abnormalQuantity: string,
  isReworkCompletion: boolean,
): BatchStepReportSourceKind {
  if (type === 'reversal') return 'reversal';
  if (isReworkCompletion) return 'rework_completion';
  const normal = integerQuantity(normalQuantity),
    abnormal = integerQuantity(abnormalQuantity);
  if (normal > 0 && abnormal > 0) return 'direct_mixed';
  return abnormal > 0 ? 'direct_abnormal' : 'direct_normal';
}

export const mapReworkView = (row: ReworkViewRow): ReworkRecordView => ({
  ...mapRework(row),
  abnormalDispositionNo: row.abnormal_disposition_no,
  sourceReportNo: row.source_report_no,
  completedNormalReportNo: row.completed_normal_report_no,
  completedAbnormalReportNo: row.completed_abnormal_report_no,
  completedNormalQuantity:
    row.completed_normal_quantity === null ? null : String(row.completed_normal_quantity),
  completedAbnormalQuantity:
    row.completed_abnormal_quantity === null ? null : String(row.completed_abnormal_quantity),
});

export async function selectDispositionViews(
  db: Db,
  batchId: string,
  sourceReportIds?: string[],
): Promise<BatchStepAbnormalDispositionView[]> {
  if (sourceReportIds?.length === 0) return [];
  const filter = sourceReportIds
    ? ` AND d.batch_step_report_id IN (${sourceReportIds.map(() => '?').join(',')})`
    : '';
  const [rows] = await db.query<DispositionViewRow[]>(
    `${DISPOSITION_VIEW_SELECT} WHERE d.production_batch_id=?${filter} ORDER BY d.created_at,d.id`,
    [batchId, ...(sourceReportIds ?? [])],
  );
  return rows.map(mapDispositionView);
}

/** 工序身份来自已授权的读取结果；仅为这些工序批量投影来源处置。 */
export async function selectStepDispositionViews(
  db: Db,
  stepRecordIds: readonly string[],
): Promise<BatchStepAbnormalDispositionView[]> {
  if (stepRecordIds.length === 0) return [];
  const [rows] = await db.query<DispositionViewRow[]>(
    `${DISPOSITION_VIEW_SELECT} WHERE d.batch_step_record_id IN (${stepRecordIds.map(() => '?').join(',')})
     ORDER BY d.created_at,d.id`,
    [...stepRecordIds],
  );
  return rows.map(mapDispositionView);
}

const mapDispositionView = (row: DispositionViewRow): BatchStepAbnormalDispositionView => ({
  ...mapDisposition(row),
  sourceReportNo: row.source_report_no,
  sourceReportSourceKind: reportSourceKind(
    row.source_report_type,
    row.source_normal_quantity,
    row.source_abnormal_quantity,
    row.source_rework_id !== null,
  ),
});

export async function selectReportReworkViews(
  db: Db,
  batchId: string,
  reportIds: string[],
): Promise<ReworkRecordView[]> {
  if (!reportIds.length) return [];
  const placeholders = reportIds.map(() => '?').join(',');
  const [rows] = await db.query<ReworkViewRow[]>(
    `SELECT ${REWORK_VIEW_FIELDS} FROM rework_records rw ${REWORK_VIEW_JOINS}
     WHERE rw.production_batch_id=? AND (rw.source_report_id IN (${placeholders})
       OR rw.completed_normal_report_id IN (${placeholders})
       OR rw.completed_abnormal_report_id IN (${placeholders})) ORDER BY rw.created_at,rw.id`,
    [batchId, ...reportIds, ...reportIds, ...reportIds],
  );
  return rows.map(mapReworkView);
}

/** 五类依赖按页批量读取，保留与写侧相同的具体事实引用。 */
export async function selectReportDependencyViews(
  db: Db,
  batchId: string,
  reportIds: string[],
): Promise<Map<string, BatchStepReportDependencyView[]>> {
  const result = new Map<string, BatchStepReportDependencyView[]>();
  if (!reportIds.length) return result;
  const placeholders = reportIds.map(() => '?').join(',');
  const [rows] = await db.query<
    (RowDataPacket & {
      kind: BatchStepReportDependencyView['kind'];
      id: number;
      report_id: number;
      business_no: string | null;
    })[]
  >(
    `SELECT 'abnormal_disposition' kind,id,batch_step_report_id report_id,disposition_no business_no
       FROM batch_step_abnormal_dispositions WHERE production_batch_id=? AND batch_step_report_id IN (${placeholders})
     UNION ALL SELECT 'replacement_report',id,replaces_report_id,report_no
       FROM batch_step_reports WHERE production_batch_id=? AND replaces_report_id IN (${placeholders})
     UNION ALL SELECT 'rework_source',id,source_report_id,rework_no
       FROM rework_records WHERE production_batch_id=? AND source_report_id IN (${placeholders})
     UNION ALL SELECT 'rework_completion',id,completed_normal_report_id,rework_no
       FROM rework_records WHERE production_batch_id=? AND completed_normal_report_id IN (${placeholders})
     UNION ALL SELECT 'rework_completion',id,completed_abnormal_report_id,rework_no
       FROM rework_records WHERE production_batch_id=? AND completed_abnormal_report_id IN (${placeholders})
     UNION ALL SELECT 'scrap_record',id,source_report_id,NULL
       FROM batch_step_scrap_records WHERE production_batch_id=? AND source_report_id IN (${placeholders})
     ORDER BY kind,id`,
    Array.from({ length: 6 }, () => [batchId, ...reportIds]).flat(),
  );
  for (const row of rows) {
    const key = String(row.report_id);
    result.set(key, [
      ...(result.get(key) ?? []),
      { kind: row.kind, id: String(row.id), businessNo: row.business_no },
    ]);
  }
  return result;
}

export function mapReportView(
  row: ReportViewRow,
  base: BatchStepReportItem,
  reworkOrigin: ReworkRecordView | null,
  dependencies: BatchStepReportDependencyView[],
): BatchStepReportView {
  const reference = (id: number | null, no: string | null): BatchStepReportReference | null =>
    id === null || no === null
      ? null
      : {
          reportId: String(id),
          reportNo: no,
          productionBatchId: base.productionBatchId,
          stepRecordId: base.stepRecordId,
        };
  return {
    ...base,
    sourceKind: reportSourceKind(
      row.report_type,
      row.normal_quantity,
      row.abnormal_quantity,
      reworkOrigin !== null,
    ),
    reversalOfReport: reference(row.reversal_of_report_id, row.reversal_of_report_no),
    correctionOfReport: reference(row.replaces_report_id, row.correction_of_report_no),
    reversalReport: reference(row.reversal_report_id, row.reversal_report_no),
    replacementReport: reference(row.replacement_report_id, row.replacement_report_no),
    reworkOrigin,
    dependencies,
  };
}

export function mapReportProcessingChain(
  dispositions: BatchStepAbnormalDispositionView[],
  reworks: ReworkRecordView[],
): BatchStepReportProcessingChainItem[] {
  const byDisposition = new Map(reworks.map((row) => [row.abnormalDispositionId, row]));
  return dispositions.map((disposition) => {
    const rework = byDisposition.get(disposition.dispositionId) ?? null;
    const completedReference = (
      id: string | null | undefined,
      no: string | null | undefined,
    ): BatchStepReportReference | null =>
      rework && id && no
        ? {
            reportId: id,
            reportNo: no,
            productionBatchId: rework.productionBatchId,
            stepRecordId: rework.stepRecordId,
          }
        : null;
    return {
      sourceReport: {
        reportId: disposition.sourceReportId,
        reportNo: disposition.sourceReportNo,
        productionBatchId: disposition.productionBatchId,
        stepRecordId: disposition.stepRecordId,
      },
      disposition,
      rework,
      completedNormalReport: completedReference(
        rework?.completedNormalReportId,
        rework?.completedNormalReportNo,
      ),
      completedAbnormalReport: completedReference(
        rework?.completedAbnormalReportId,
        rework?.completedAbnormalReportNo,
      ),
    };
  });
}
