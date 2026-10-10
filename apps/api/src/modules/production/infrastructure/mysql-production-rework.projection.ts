import type { RowDataPacket } from 'mysql2/promise';
import type { ReworkRecordItem } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';

export type ReworkRow = RowDataPacket & {
  id: number;
  rework_no: string;
  abnormal_disposition_id: number;
  production_batch_id: number;
  batch_step_record_id: number;
  source_report_id: number;
  responsible_user_id: number;
  rework_quantity: string;
  unit_snapshot: string;
  status: ReworkRecordItem['status'];
  completed_normal_report_id: number | null;
  completed_abnormal_report_id: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  version: number;
  remark: string | null;
  created_at: Date;
};

export const REWORK_COLUMNS = `rw.id,rw.rework_no,rw.abnormal_disposition_id,rw.production_batch_id,
  rw.batch_step_record_id,rw.source_report_id,rw.responsible_user_id,rw.rework_quantity,
  rw.unit_snapshot,rw.status,rw.completed_normal_report_id,rw.completed_abnormal_report_id,
  rw.started_at,rw.completed_at,rw.version,
  rw.remark,rw.created_at`;

/** 命令也使用此基础映射；只读关系字段在独立 View 中扩展。 */
export const mapRework = (row: ReworkRow): ReworkRecordItem => ({
  reworkId: String(row.id),
  reworkNo: row.rework_no,
  abnormalDispositionId: String(row.abnormal_disposition_id),
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  sourceReportId: String(row.source_report_id),
  responsibleUserId: String(row.responsible_user_id),
  responsibleUserName: null,
  reworkQuantity: String(row.rework_quantity),
  unit: row.unit_snapshot,
  status: row.status,
  completedNormalReportId:
    row.completed_normal_report_id === null ? null : String(row.completed_normal_report_id),
  completedAbnormalReportId:
    row.completed_abnormal_report_id === null ? null : String(row.completed_abnormal_report_id),
  startedAt: row.started_at ? toBeijingISOString(row.started_at) : null,
  completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
  version: row.version,
  remark: row.remark,
  createdAt: toBeijingISOString(row.created_at),
});
