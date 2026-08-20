import type { RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepAbnormalDispositionItem,
  BatchStepExecutionRecordItem,
  BatchStepReportItem,
  BatchStepStatus,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import type { RouteStepQuantity } from '../domain/production-route-quantity.policy.js';

export type ReportRow = RowDataPacket & {
  id: number;
  report_no: string;
  production_batch_id: number;
  batch_step_record_id: number;
  report_type: 'normal' | 'reversal';
  reversal_of_report_id: number | null;
  replaces_report_id: number | null;
  reported_quantity: string;
  normal_quantity: string;
  abnormal_quantity: string;
  abnormal_origin: BatchStepReportItem['abnormalOrigin'];
  unit_snapshot: string;
  remark: string | null;
  created_by: number;
  created_at: Date;
  is_effective: number;
};

export type DispositionRow = RowDataPacket & {
  id: number;
  disposition_no: string;
  production_batch_id: number;
  batch_step_record_id: number;
  batch_step_report_id: number;
  abnormal_origin: BatchStepAbnormalDispositionItem['abnormalOrigin'];
  review_status: BatchStepAbnormalDispositionItem['reviewStatus'];
  disposition_type: 'rework' | 'scrap' | null;
  remark: string | null;
  version: number;
  created_at: Date;
};

export type ProjectionStepRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  step_order_snapshot: number;
  step_code_snapshot: string;
  step_name_snapshot: string;
  status: BatchStepStatus;
  responsible_user_id: number | null;
  need_record_snapshot: number;
  unit_snapshot: string;
  effective_reported: string;
  effective_direct_reported: string;
  effective_normal: string;
  effective_abnormal: string;
  started_at: Date | null;
  completed_at: Date | null;
  version: number;
};

export const mapReport = (row: ReportRow): BatchStepReportItem => ({
  reportId: String(row.id),
  reportNo: row.report_no,
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  reportType: row.report_type,
  reversalOfReportId: row.reversal_of_report_id === null ? null : String(row.reversal_of_report_id),
  correctionOfReportId: row.replaces_report_id === null ? null : String(row.replaces_report_id),
  reportedQuantity: row.reported_quantity,
  normalQuantity: row.normal_quantity,
  abnormalQuantity: row.abnormal_quantity,
  abnormalOrigin: row.abnormal_origin,
  unit: row.unit_snapshot,
  remark: row.remark,
  createdById: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  isEffective: Boolean(row.is_effective),
});

export const mapDisposition = (row: DispositionRow): BatchStepAbnormalDispositionItem => ({
  dispositionId: String(row.id),
  dispositionNo: row.disposition_no,
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  sourceReportId: String(row.batch_step_report_id),
  abnormalOrigin: row.abnormal_origin,
  reviewStatus: row.review_status,
  dispositionType: row.disposition_type,
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
});

export const mapExecutionStep = (
  row: ProjectionStepRow,
  plannedQuantity: string,
  quantity: RouteStepQuantity,
  reports: ReportRow[],
  dispositions: DispositionRow[],
): BatchStepExecutionRecordItem => ({
  stepRecordId: String(row.id),
  productionBatchId: String(row.production_batch_id),
  stepOrder: row.step_order_snapshot,
  stepCode: row.step_code_snapshot,
  stepName: row.step_name_snapshot,
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  responsibleUserName: null,
  status: row.status,
  needRecord: Boolean(row.need_record_snapshot),
  unit: row.unit_snapshot,
  baseNormalQuantity: fixed(plannedQuantity),
  requiredNormalQuantity: quantity.requiredNormalQuantity,
  releasedNormalQuantity: quantity.releasedInputQuantity,
  availableNormalQuantity: quantity.availableReportQuantity,
  effectiveReportedQuantity: row.effective_reported,
  effectiveDirectReportedQuantity: row.effective_direct_reported,
  effectiveNormalQuantity: row.effective_normal,
  effectiveAbnormalQuantity: row.effective_abnormal,
  remainingNormalQuantity: quantity.remainingNormalQuantity,
  activatedSupplementInputQuantity: quantity.activatedSupplementInputQuantity,
  activatedSupplementTargetQuantity: quantity.activatedSupplementTargetQuantity,
  pendingSupplementInputQuantity: quantity.pendingSupplementInputQuantity,
  isSupplementReopened: quantity.isSupplementReopened,
  supplementBlockedReason: quantity.supplementBlockedReason,
  supplementSources: quantity.supplementSources,
  startedAt: row.started_at ? toBeijingISOString(row.started_at) : null,
  completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
  version: row.version,
  reports: reports.map(mapReport),
  abnormalDispositions: dispositions.map(mapDisposition),
});

export const groupRowsBy = <T>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
};

const fixed = (value: number | string): string => Number(value).toFixed(4);
