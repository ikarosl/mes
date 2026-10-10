import type { RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepAbnormalDispositionItem,
  BatchStepAbnormalDispositionView,
  BatchStepExecutionRecordItem,
  BatchStepReportItem,
  BatchStepStatus,
  ProductionStepQuantityProjection,
  ProductionStepActionAvailability,
  ProductionStepQuotaDistribution,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import type { RouteStepQuantity } from '../domain/production-route-quantity.policy.js';
import { fixedIntegerQuantity } from '../domain/integer-quantity.js';
import type { reportWriteEligibility } from '../domain/production-reporting.policy.js';

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
  source_abnormal_quantity: string;
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
  unit_snapshot: string;
  effective_reported: string;
  effective_direct_reported: string;
  effective_direct_normal: string;
  effective_direct_abnormal: string;
  effective_normal: string;
  effective_abnormal: string;
  started_at: Date | null;
  completed_at: Date | null;
  version: number;
  report_count: number;
  first_reported_at: Date | null;
  last_reported_at: Date | null;
};

export const mapReport = (
  row: ReportRow,
  eligibility: Pick<
    BatchStepReportItem,
    'canReverse' | 'canCorrect' | 'correctionBlockedReason'
  > = {
    canReverse: false,
    canCorrect: false,
    correctionBlockedReason: '该记录仅供历史查看',
  },
): BatchStepReportItem => ({
  reportId: String(row.id),
  reportNo: row.report_no,
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  reportType: row.report_type,
  reversalOfReportId: row.reversal_of_report_id === null ? null : String(row.reversal_of_report_id),
  correctionOfReportId: row.replaces_report_id === null ? null : String(row.replaces_report_id),
  reportedQuantity: String(row.reported_quantity),
  normalQuantity: String(row.normal_quantity),
  abnormalQuantity: String(row.abnormal_quantity),
  abnormalOrigin: row.abnormal_origin,
  unit: row.unit_snapshot,
  remark: row.remark,
  createdById: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  isEffective: Boolean(row.is_effective),
  ...eligibility,
});

export const mapDisposition = (row: DispositionRow): BatchStepAbnormalDispositionItem => ({
  dispositionId: String(row.id),
  dispositionNo: row.disposition_no,
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  sourceReportId: String(row.batch_step_report_id),
  sourceAbnormalQuantity: String(row.source_abnormal_quantity),
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
  dispositions: BatchStepAbnormalDispositionView[],
  reporting: ReturnType<typeof reportWriteEligibility>,
  actions: ProductionStepActionAvailability,
  quotaDistribution: ProductionStepQuotaDistribution,
): BatchStepExecutionRecordItem => ({
  stepRecordId: String(row.id),
  productionBatchId: String(row.production_batch_id),
  stepOrder: row.step_order_snapshot,
  stepCode: row.step_code_snapshot,
  stepName: row.step_name_snapshot,
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  responsibleUserName: null,
  status: row.status,
  unit: row.unit_snapshot,
  baseNormalQuantity: fixed(plannedQuantity),
  ...mapQuantityProjection(row, quantity),
  activatedSupplementInputQuantity: quantity.activatedSupplementInputQuantity,
  activatedSupplementTargetQuantity: quantity.activatedSupplementTargetQuantity,
  pendingSupplementInputQuantity: quantity.pendingSupplementInputQuantity,
  supplementSources: quantity.supplementSources,
  startedAt: row.started_at ? toBeijingISOString(row.started_at) : null,
  completedAt: row.completed_at ? toBeijingISOString(row.completed_at) : null,
  version: row.version,
  reportCount: Number(row.report_count),
  hasReportHistory: Number(row.report_count) > 0,
  firstReportedAt: row.first_reported_at ? toBeijingISOString(row.first_reported_at) : null,
  lastReportedAt: row.last_reported_at ? toBeijingISOString(row.last_reported_at) : null,
  ...reporting,
  canAdminStart: actions.canStart,
  startBlockedReason: actions.startBlockedReason,
  canAdminComplete: actions.canComplete,
  completeBlockedReason: actions.completeBlockedReason,
  canAdminReopen: actions.canReopen,
  reopenBlockedReason: actions.reopenBlockedReason,
  abnormalDispositions: dispositions,
  quotaDistribution,
});

export const mapQuantityProjection = (
  row: Pick<
    ProjectionStepRow,
    | 'effective_reported'
    | 'effective_direct_reported'
    | 'effective_direct_normal'
    | 'effective_direct_abnormal'
    | 'effective_normal'
    | 'effective_abnormal'
  >,
  quantity: RouteStepQuantity,
): ProductionStepQuantityProjection => ({
  upperLimitQuantity: quantity.upperLimitQuantity,
  requiredNormalQuantity: quantity.requiredNormalQuantity,
  availableReportQuantity: quantity.availableReportQuantity,
  effectiveReportedQuantity: fixed(row.effective_reported),
  effectiveDirectReportedQuantity: fixed(row.effective_direct_reported),
  effectiveDirectNormalQuantity: fixed(row.effective_direct_normal),
  effectiveDirectAbnormalQuantity: fixed(row.effective_direct_abnormal),
  effectiveNormalQuantity: fixed(row.effective_normal),
  effectiveAbnormalQuantity: fixed(row.effective_abnormal),
  remainingNormalQuantity: quantity.remainingNormalQuantity,
  previousStepNormalQuantity: quantity.previousStepNormalQuantity,
  directReportedVsPreviousNormalDifference: quantity.directReportedVsPreviousNormalDifference,
  normalVsPreviousNormalDifference: quantity.normalVsPreviousNormalDifference,
  normalVsTargetDifference: quantity.normalVsTargetDifference,
});

export const groupRowsBy = <T>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
};

const fixed = fixedIntegerQuantity;
