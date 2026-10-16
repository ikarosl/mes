import type { RowDataPacket } from 'mysql2/promise';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';
import { nullableBeijingDateTime as date } from '../shared/mysql-production-mapping.js';

export type StepRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  route_step_id: number;
  step_order_snapshot: number;
  step_code_snapshot: string;
  step_name_snapshot: string;
  sop_file_id_snapshot: number | null;
  sop_file_name_snapshot: string | null;
  sop_version_no_snapshot: string | null;
  default_responsible_user_id_snapshot: number | null;
  actual_sop_file_id: number | null;
  actual_sop_file_name_snapshot: string | null;
  actual_sop_object_key_snapshot: string | null;
  actual_sop_version_no_snapshot: string | null;
  responsible_user_id: number | null;
  need_inspection_snapshot: number;
  status: 'pending' | 'assigned' | 'doing' | 'completed' | 'terminated';
  started_at: Date | null;
  completed_at: Date | null;
  output_quantity: string;
  normal_quantity: string;
  abnormal_quantity: string;
  rework_quantity: string;
  unit_snapshot: string;
  remark: string | null;
  version: number;
};

export const STEP_RECORD_SELECT = `SELECT sr.id,sr.production_batch_id,sr.route_step_id,sr.step_order_snapshot,sr.step_code_snapshot,sr.step_name_snapshot,sr.sop_file_id_snapshot,sr.sop_file_name_snapshot,sr.sop_version_no_snapshot,sr.default_responsible_user_id_snapshot,sr.actual_sop_file_id,sr.actual_sop_file_name_snapshot,sr.actual_sop_object_key_snapshot,sr.actual_sop_version_no_snapshot,sr.responsible_user_id,sr.need_inspection_snapshot,sr.status,sr.started_at,sr.completed_at,COALESCE(report_summary.reported_quantity,0) output_quantity,COALESCE(report_summary.normal_quantity,0) normal_quantity,COALESCE(report_summary.abnormal_quantity,0) abnormal_quantity,0 rework_quantity,sr.unit_snapshot,sr.remark,sr.version FROM batch_step_records sr LEFT JOIN (SELECT batch_step_record_id,SUM(CASE WHEN report_type='normal' THEN reported_quantity ELSE -reported_quantity END) reported_quantity,SUM(CASE WHEN report_type='normal' THEN normal_quantity ELSE -normal_quantity END) normal_quantity,SUM(CASE WHEN report_type='normal' THEN abnormal_quantity ELSE -abnormal_quantity END) abnormal_quantity FROM batch_step_reports WHERE quantity_scope='production' GROUP BY batch_step_record_id) report_summary ON report_summary.batch_step_record_id=sr.id`;

export async function findStepRecord(
  db: Db,
  batchId: string,
  recordId: string,
  lock = false,
): Promise<StepRow> {
  const [rows] = await db.query<StepRow[]>(
    `${STEP_RECORD_SELECT} WHERE sr.id=? AND sr.production_batch_id=?${lock ? ' FOR UPDATE' : ''}`,
    [recordId, batchId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
  return rows[0];
}

export const mapStep = (row: StepRow) => ({
  id: String(row.id),
  productionBatchId: String(row.production_batch_id),
  routeStepId: String(row.route_step_id),
  stepOrder: row.step_order_snapshot,
  stepCode: row.step_code_snapshot,
  stepName: row.step_name_snapshot,
  defaultSopFileId: row.sop_file_id_snapshot === null ? null : String(row.sop_file_id_snapshot),
  defaultSopFileName: row.sop_file_name_snapshot,
  defaultSopVersionNo: row.sop_version_no_snapshot,
  actualSopFileId: row.actual_sop_file_id === null ? null : String(row.actual_sop_file_id),
  actualSopFileName: row.actual_sop_file_name_snapshot,
  actualSopVersionNo: row.actual_sop_version_no_snapshot,
  defaultResponsibleUserId:
    row.default_responsible_user_id_snapshot === null
      ? null
      : String(row.default_responsible_user_id_snapshot),
  defaultResponsibleUserName: null,
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  responsibleUserName: null,
  needInspection: Boolean(row.need_inspection_snapshot),
  status: row.status,
  startedAt: date(row.started_at),
  completedAt: date(row.completed_at),
  outputQuantity: String(row.output_quantity),
  normalQuantity: String(row.normal_quantity),
  abnormalQuantity: String(row.abnormal_quantity),
  reworkQuantity: String(row.rework_quantity),
  unit: row.unit_snapshot,
  remark: row.remark,
  version: row.version,
});

export const stepAudit = (row: StepRow) => ({
  actualSopFileId: row.actual_sop_file_id === null ? null : String(row.actual_sop_file_id),
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  version: row.version,
});
