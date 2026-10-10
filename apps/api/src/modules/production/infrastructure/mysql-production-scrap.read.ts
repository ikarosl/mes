import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { BatchStepScrapRecordView, PageQuery, PageResult } from '@company/contracts';
import type { ProductionReportingAccess } from '../domain/production-reporting.policy.js';
import { fixedIntegerQuantity } from '../domain/integer-quantity.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { selectReportReadContext } from './mysql-production-reporting.read.js';
import { reportSourceKind } from './mysql-production-report-trace.read.js';

type ScrapViewRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  batch_step_record_id: number;
  source_report_id: number;
  scrap_quantity: string;
  unit_snapshot: string;
  created_by: number;
  created_at: Date;
  disposition_id: number;
  disposition_no: string;
  disposition_remark: string | null;
  source_report_no: string;
  source_report_type: 'normal' | 'reversal';
  source_report_normal: string;
  source_report_abnormal: string;
  source_report_remark: string | null;
  source_rework_id: number | null;
  authorization_id: number | null;
  entry_step_record_id: number | null;
  quota_end_step_record_id: number | null;
  authorized_quantity: string | null;
  authorized_by: number | null;
  authorized_at: Date | null;
  supplement_id: number | null;
  supplement_no: string | null;
  supplement_status: 'approved' | 'fulfilled' | 'cancelled' | null;
  supplement_remark: string | null;
  supplement_created_at: Date | null;
};

const SCRAP_JOINS = `
  JOIN batch_step_abnormal_dispositions d ON d.id=s.abnormal_disposition_id
    AND d.production_batch_id=s.production_batch_id AND d.batch_step_record_id=s.batch_step_record_id
    AND d.batch_step_report_id=s.source_report_id
  JOIN batch_step_reports source_report ON source_report.id=s.source_report_id
    AND source_report.production_batch_id=s.production_batch_id AND source_report.batch_step_record_id=s.batch_step_record_id
  LEFT JOIN rework_records source_rework ON
    (source_rework.completed_normal_report_id=source_report.id OR source_rework.completed_abnormal_report_id=source_report.id)
    AND source_rework.production_batch_id=s.production_batch_id AND source_rework.batch_step_record_id=s.batch_step_record_id
  LEFT JOIN production_material_supplement supplement ON supplement.step_scrap_record_id=s.id
    AND supplement.production_batch_id=s.production_batch_id AND supplement.batch_step_record_id=s.batch_step_record_id
  LEFT JOIN batch_step_scrap_reproduction_authorization authorization ON authorization.scrap_record_id=s.id
    AND authorization.production_batch_id=s.production_batch_id AND authorization.quota_end_step_record_id=s.batch_step_record_id
    AND authorization.supplement_id=supplement.id`;

/** 分页明细与总数共享读取快照，并复用报工读取的当前工序归属边界。 */
export async function selectStepScrapPage(
  db: PoolConnection,
  batchId: string,
  stepRecordId: string,
  query: PageQuery,
  access: ProductionReportingAccess,
): Promise<PageResult<BatchStepScrapRecordView>> {
  await selectReportReadContext(db, batchId, stepRecordId, access);
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10;
  const where = 'WHERE s.production_batch_id=? AND s.batch_step_record_id=?';
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM batch_step_scrap_records s ${SCRAP_JOINS} ${where}`,
    [batchId, stepRecordId],
  );
  const [rows] = await db.query<ScrapViewRow[]>(
    `SELECT s.id,s.production_batch_id,s.batch_step_record_id,s.source_report_id,s.scrap_quantity,
      s.unit_snapshot,s.created_by,s.created_at,d.id disposition_id,d.disposition_no,d.remark disposition_remark,
      source_report.report_no source_report_no,source_report.report_type source_report_type,
      source_report.normal_quantity source_report_normal,source_report.abnormal_quantity source_report_abnormal,
      source_report.remark source_report_remark,source_rework.id source_rework_id,
      authorization.id authorization_id,authorization.entry_step_record_id,authorization.quota_end_step_record_id,
      authorization.authorized_quantity,authorization.authorized_by,authorization.authorized_at,
      supplement.id supplement_id,supplement.supplement_no,supplement.status supplement_status,
      supplement.remark supplement_remark,supplement.created_at supplement_created_at
     FROM batch_step_scrap_records s ${SCRAP_JOINS} ${where}
     ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?`,
    [batchId, stepRecordId, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapScrapView), total: Number(count?.total ?? 0), page, pageSize };
}

const mapScrapView = (row: ScrapViewRow): BatchStepScrapRecordView => ({
  scrapRecordId: String(row.id),
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  scrapQuantity: fixedIntegerQuantity(row.scrap_quantity),
  unit: row.unit_snapshot,
  sourceReport: {
    reportId: String(row.source_report_id),
    reportNo: row.source_report_no,
    productionBatchId: String(row.production_batch_id),
    stepRecordId: String(row.batch_step_record_id),
  },
  sourceReportSourceKind: reportSourceKind(
    row.source_report_type,
    row.source_report_normal,
    row.source_report_abnormal,
    row.source_rework_id !== null,
  ),
  sourceReportRemark: row.source_report_remark,
  dispositionId: String(row.disposition_id),
  dispositionNo: row.disposition_no,
  remark: row.disposition_remark,
  createdBy: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  reproductionAuthorization:
    row.authorization_id === null
      ? null
      : {
          authorizationId: String(row.authorization_id),
          scrapRecordId: String(row.id),
          supplementId: String(row.supplement_id),
          entryStepRecordId: String(row.entry_step_record_id),
          quotaEndStepRecordId: String(row.quota_end_step_record_id),
          authorizedQuantity: fixedIntegerQuantity(row.authorized_quantity!),
          authorizedBy: String(row.authorized_by),
          authorizedByName: null,
          authorizedAt: toBeijingISOString(row.authorized_at!),
        },
  supplement:
    row.supplement_id === null
      ? null
      : {
          supplementId: String(row.supplement_id),
          supplementNo: row.supplement_no!,
          status: row.supplement_status!,
          remark: row.supplement_remark,
          createdAt: toBeijingISOString(row.supplement_created_at!),
        },
});
