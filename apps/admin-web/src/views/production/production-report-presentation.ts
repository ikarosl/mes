import type {
  BatchStepAbnormalDispositionView,
  BatchStepReportDependencyView,
  BatchStepReportProcessingChainItem,
  BatchStepReportReference,
  BatchStepReportView,
  ReworkRecordView,
} from '@company/contracts';
import {
  BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS,
  BATCH_STEP_REPORT_SOURCE_KIND_LABELS,
  BATCH_STEP_REWORK_RESULT_LABELS,
  REWORK_STATUS_LABELS,
} from '@company/constants';
import { formatQuantity, type StatusTagType } from './production-status';

export const reportReference = (
  report: Pick<BatchStepReportView, 'reportId' | 'reportNo' | 'productionBatchId' | 'stepRecordId'>,
): BatchStepReportReference => ({
  reportId: report.reportId,
  reportNo: report.reportNo,
  productionBatchId: report.productionBatchId,
  stepRecordId: report.stepRecordId,
});

/** 符号只表达本条事实的数量变动，不改变 API 数量及累计投影。 */
export const reportQuantityChange = (quantity: string, report: BatchStepReportView): string => {
  const amount = Number(quantity);
  if (!Number.isFinite(amount)) return '—';
  if (amount === 0) return '0';
  const sign = report.sourceKind === 'reversal' ? '-' : '+';
  return `${sign}${formatQuantity(Math.abs(amount))}`;
};

export const reportBusinessLabel = (report: BatchStepReportView): string => {
  if (report.sourceKind === 'rework_completion' && report.reworkOrigin) {
    if (report.reportId === report.reworkOrigin.completedNormalReportId)
      return BATCH_STEP_REWORK_RESULT_LABELS.normal;
    if (report.reportId === report.reworkOrigin.completedAbnormalReportId)
      return BATCH_STEP_REWORK_RESULT_LABELS.abnormal;
  }
  return BATCH_STEP_REPORT_SOURCE_KIND_LABELS[report.sourceKind];
};

export const reportEffectMeta = (
  report: BatchStepReportView,
): {
  label: string;
  type: StatusTagType;
} => {
  if (report.sourceKind === 'reversal') return { label: '已生效', type: 'success' };
  if (report.reversalReport) return { label: '已冲销', type: 'info' };
  return {
    label: report.isEffective ? '有效' : '历史记录',
    type: report.isEffective ? 'success' : 'info',
  };
};

export const reportReadOnlyReason = (report: BatchStepReportView): string | null => {
  if (report.sourceKind === 'reversal') return '冲销事实只读';
  if (report.reversalReport) return `已由 ${report.reversalReport.reportNo} 冲销`;
  if (report.sourceKind === 'rework_completion')
    return report.reworkOrigin
      ? `${report.reworkOrigin.reworkNo} 的${reportBusinessLabel(report)}，结果事实只读`
      : '返工完成结果只读';
  const documentNos = [
    ...new Set(report.dependencies.map((item) => item.businessNo).filter(Boolean)),
  ];
  if (documentNos.length) return `已关联 ${documentNos.join('、')}，记录只读`;
  return !report.canCorrect && !report.canReverse ? report.correctionBlockedReason : null;
};

export const reportHasProcessing = (report: BatchStepReportView): boolean =>
  Boolean(report.reworkOrigin) ||
  report.dependencies.some((item) =>
    ['abnormal_disposition', 'rework_source', 'rework_completion', 'scrap_record'].includes(
      item.kind,
    ),
  );

export const reportDependencyLabel = (dependency: BatchStepReportDependencyView): string => {
  if (dependency.businessNo) return dependency.businessNo;
  return dependency.kind === 'scrap_record' ? `报废事实（记录 ID ${dependency.id}）` : '关联事实';
};

export const reportRelations = (
  report: BatchStepReportView,
): Array<{
  label: string;
  report: BatchStepReportReference | null;
}> => {
  const relations: ReturnType<typeof reportRelations> = [];
  if (report.reworkOrigin) {
    relations.push({ label: `返工单 ${report.reworkOrigin.reworkNo}`, report: null });
    relations.push({ label: '来源报工', report: reworkSourceReference(report.reworkOrigin) });
    for (const result of reworkResultReferences(report.reworkOrigin)) {
      if (result.report.reportId !== report.reportId)
        relations.push({ label: result.label, report: result.report });
    }
  }
  if (report.reversalOfReport)
    relations.push({ label: '冲销原单', report: report.reversalOfReport });
  if (report.correctionOfReport)
    relations.push({ label: '更正原单', report: report.correctionOfReport });
  if (report.reversalReport) relations.push({ label: '冲销单', report: report.reversalReport });
  if (report.replacementReport)
    relations.push({ label: '替代单', report: report.replacementReport });
  return relations.length ? relations : [{ label: '直接报工', report: null }];
};

export interface AbnormalProcessingGroup {
  sourceReport: BatchStepReportReference;
  disposition: BatchStepAbnormalDispositionView | null;
  rework: ReworkRecordView | null;
  completedNormalReport: BatchStepReportReference | null;
  completedAbnormalReport: BatchStepReportReference | null;
}

export const reworkSourceReference = (rework: ReworkRecordView): BatchStepReportReference => ({
  reportId: rework.sourceReportId,
  reportNo: rework.sourceReportNo,
  productionBatchId: rework.productionBatchId,
  stepRecordId: rework.stepRecordId,
});

export const reworkNormalResultReference = (
  rework: ReworkRecordView,
): BatchStepReportReference | null =>
  rework.completedNormalReportId && rework.completedNormalReportNo
    ? {
        reportId: rework.completedNormalReportId,
        reportNo: rework.completedNormalReportNo,
        productionBatchId: rework.productionBatchId,
        stepRecordId: rework.stepRecordId,
      }
    : null;

export const reworkAbnormalResultReference = (
  rework: ReworkRecordView,
): BatchStepReportReference | null =>
  rework.completedAbnormalReportId && rework.completedAbnormalReportNo
    ? {
        reportId: rework.completedAbnormalReportId,
        reportNo: rework.completedAbnormalReportNo,
        productionBatchId: rework.productionBatchId,
        stepRecordId: rework.stepRecordId,
      }
    : null;

export const reworkResultReferences = (
  rework: ReworkRecordView,
): Array<{ label: string; report: BatchStepReportReference }> => {
  const references: ReturnType<typeof reworkResultReferences> = [];
  const normal = reworkNormalResultReference(rework);
  const abnormal = reworkAbnormalResultReference(rework);
  if (normal)
    references.push({
      label: BATCH_STEP_REWORK_RESULT_LABELS.normal,
      report: normal,
    });
  if (abnormal)
    references.push({
      label: BATCH_STEP_REWORK_RESULT_LABELS.abnormal,
      report: abnormal,
    });
  return references;
};

export const abnormalProcessingGroups = (
  dispositions: BatchStepAbnormalDispositionView[],
  reworks: ReworkRecordView[],
): AbnormalProcessingGroup[] => {
  const groups = dispositions.map((disposition): AbnormalProcessingGroup => {
    const rework =
      reworks.find((item) => item.abnormalDispositionId === disposition.dispositionId) ?? null;
    return {
      sourceReport: {
        reportId: disposition.sourceReportId,
        reportNo: disposition.sourceReportNo,
        productionBatchId: disposition.productionBatchId,
        stepRecordId: disposition.stepRecordId,
      },
      disposition,
      rework,
      completedNormalReport: rework ? reworkNormalResultReference(rework) : null,
      completedAbnormalReport: rework ? reworkAbnormalResultReference(rework) : null,
    };
  });
  for (const rework of reworks) {
    if (groups.some((group) => group.rework?.reworkId === rework.reworkId)) continue;
    groups.push({
      sourceReport: reworkSourceReference(rework),
      disposition: null,
      rework,
      completedNormalReport: reworkNormalResultReference(rework),
      completedAbnormalReport: reworkAbnormalResultReference(rework),
    });
  }
  return groups;
};

export const processingChainGroups = (
  chain: BatchStepReportProcessingChainItem[],
): AbnormalProcessingGroup[] => chain;

export const processingGroupPending = (group: AbnormalProcessingGroup): boolean =>
  group.disposition?.reviewStatus === 'pending_review' ||
  group.rework?.status === 'pending' ||
  group.rework?.status === 'doing';

export const dispositionResultLabel = (item: BatchStepAbnormalDispositionView): string => {
  if (item.reviewStatus === 'approved' && item.dispositionType === 'rework') return '已批准返工';
  if (item.reviewStatus === 'approved' && item.dispositionType === 'scrap') return '已批准报废';
  return BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS[item.reviewStatus];
};

export const processingGroupMeta = (
  group: AbnormalProcessingGroup,
): { label: string; type: StatusTagType } => {
  if (group.disposition?.reviewStatus === 'pending_review')
    return { label: '待处置', type: 'warning' };
  if (group.rework)
    return {
      label: REWORK_STATUS_LABELS[group.rework.status],
      type:
        group.rework.status === 'completed'
          ? 'success'
          : group.rework.status === 'cancelled'
            ? 'info'
            : 'primary',
    };
  if (group.disposition)
    return {
      label: dispositionResultLabel(group.disposition),
      type: group.disposition.reviewStatus === 'approved' ? 'success' : 'info',
    };
  return { label: '处理记录', type: 'info' };
};

const recordedResultQuantity = (quantity: string | null | undefined): string =>
  quantity === null || quantity === undefined ? '待核对' : formatQuantity(quantity);

export const processingGroupSummary = (group: AbnormalProcessingGroup): string => {
  const parts = [
    `${group.sourceReport.reportNo} · 异常 ${formatQuantity(group.disposition?.sourceAbnormalQuantity ?? group.rework?.reworkQuantity)}`,
  ];
  if (group.disposition)
    parts.push(`${group.disposition.dispositionNo} · ${dispositionResultLabel(group.disposition)}`);
  if (group.rework)
    parts.push(`${group.rework.reworkNo} · ${REWORK_STATUS_LABELS[group.rework.status]}`);
  if (group.completedNormalReport)
    parts.push(
      `${group.completedNormalReport.reportNo} · ${BATCH_STEP_REWORK_RESULT_LABELS.normal} ${recordedResultQuantity(group.rework?.completedNormalQuantity)}`,
    );
  if (group.completedAbnormalReport)
    parts.push(
      `${group.completedAbnormalReport.reportNo} · ${BATCH_STEP_REWORK_RESULT_LABELS.abnormal} ${recordedResultQuantity(group.rework?.completedAbnormalQuantity)}`,
    );
  return parts.join(' → ');
};
