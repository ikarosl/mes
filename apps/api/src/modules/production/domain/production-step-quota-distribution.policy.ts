import type {
  BatchStepAbnormalDispositionView,
  BatchStepReportItem,
  BatchStepReportReference,
  ProductionStepQuotaDispositionReference,
  ProductionStepQuotaDistribution,
  ProductionStepQuotaReworkReference,
  ReworkRecordItem,
} from '@company/contracts';
import { fixedIntegerQuantity as fixed, integerQuantity } from './integer-quantity.js';

export interface StepQuotaScrapFact {
  scrapRecordId: string;
  productionBatchId: string;
  stepRecordId: string;
  dispositionId: string;
  sourceReportId: string;
  quantity: string;
  unit: string;
}

interface StepQuotaFacts {
  productionBatchId: string;
  stepRecordId: string;
  unit: string;
  directReportedQuantity: string;
  normalQuantity: string;
  upperLimitQuantity: string;
  availableQuantity: string;
  reports: BatchStepReportItem[];
  dispositions: BatchStepAbnormalDispositionView[];
  reworks: ReworkRecordItem[];
  scraps: StepQuotaScrapFact[];
}

const unavailable = (reason: string): ProductionStepQuotaDistribution => ({
  scrappedQuantity: null,
  processingQuantity: null,
  terminatedQuantity: null,
  pendingReviewQuantity: null,
  pendingReworkQuantity: null,
  doingReworkQuantity: null,
  isReliable: false,
  unavailableReason: reason,
  pendingDispositions: [],
  pendingReworks: [],
  doingReworks: [],
  terminatedDispositions: [],
  cancelledReworks: [],
});

const reportReference = (report: BatchStepReportItem): BatchStepReportReference => ({
  reportId: report.reportId,
  reportNo: report.reportNo,
  productionBatchId: report.productionBatchId,
  stepRecordId: report.stepRecordId,
});

/** 从有效直接根沿整单返工来源分类；只读校验不改变历史保护或写入规则。 */
export function calculateStepQuotaDistribution(
  facts: StepQuotaFacts,
): ProductionStepQuotaDistribution {
  const reports = new Map(facts.reports.map((report) => [report.reportId, report]));
  const reversed = new Set<string>();
  const completedBy = new Map<string, ReworkRecordItem>();
  const dispositions = new Map(facts.dispositions.map((item) => [item.sourceReportId, item]));
  const reworks = new Map(facts.reworks.map((item) => [item.sourceReportId, item]));
  const scraps = new Map(facts.scraps.map((item) => [item.sourceReportId, item]));
  const hasSameOwner = (item: { productionBatchId: string; stepRecordId: string }): boolean =>
    item.productionBatchId === facts.productionBatchId && item.stepRecordId === facts.stepRecordId;
  if (
    reports.size !== facts.reports.length ||
    dispositions.size !== facts.dispositions.length ||
    reworks.size !== facts.reworks.length ||
    scraps.size !== facts.scraps.length ||
    [...facts.reports, ...facts.dispositions, ...facts.reworks, ...facts.scraps].some(
      (item) => !hasSameOwner(item),
    )
  )
    return unavailable('异常来源链存在重复或归属不一致，请核对相关记录');

  for (const report of facts.reports) {
    const normal = integerQuantity(report.normalQuantity),
      abnormal = integerQuantity(report.abnormalQuantity);
    if (
      normal < 0 ||
      abnormal < 0 ||
      normal + abnormal <= 0 ||
      normal + abnormal !== integerQuantity(report.reportedQuantity) ||
      report.unit !== facts.unit
    )
      return unavailable('报工事实数量或单位不一致，请核对相关记录');
    if (report.reportType === 'reversal') {
      const original = reports.get(report.reversalOfReportId ?? '');
      if (
        !original ||
        original.reportType !== 'normal' ||
        reversed.has(original.reportId) ||
        report.normalQuantity !== original.normalQuantity ||
        report.abnormalQuantity !== original.abnormalQuantity ||
        report.reportedQuantity !== original.reportedQuantity ||
        report.unit !== original.unit ||
        report.abnormalOrigin !== original.abnormalOrigin
      )
        return unavailable('报工冲销与来源事实不一致，请核对相关记录');
      reversed.add(original.reportId);
    } else if (report.reversalOfReportId !== null) {
      return unavailable('正向报工的冲销引用不一致，请核对相关记录');
    }
  }
  for (const report of facts.reports) {
    if (report.correctionOfReportId !== null) {
      const original = reports.get(report.correctionOfReportId);
      if (!original || original.reportType !== 'normal' || !reversed.has(original.reportId))
        return unavailable('报工更正链不完整，请核对相关记录');
    }
  }
  for (const rework of facts.reworks) {
    const resultIds = [rework.completedNormalReportId, rework.completedAbnormalReportId].filter(
      (id): id is string => id !== null,
    );
    if (resultIds.length === 0 && rework.status === 'completed') {
      return unavailable('返工单缺少完成报工，请核对相关记录');
    }
    for (const resultId of resultIds) {
      if (rework.status !== 'completed' || completedBy.has(resultId))
        return unavailable('返工完成事实存在重复或状态不一致，请核对相关记录');
      completedBy.set(resultId, rework);
    }
  }

  const visited = new Set<string>(),
    visitedReworks = new Set<string>(),
    visitedScraps = new Set<string>();
  const pendingDispositions: ProductionStepQuotaDispositionReference[] = [],
    terminatedDispositions: ProductionStepQuotaDispositionReference[] = [],
    pendingReworks: ProductionStepQuotaReworkReference[] = [],
    doingReworks: ProductionStepQuotaReworkReference[] = [],
    cancelledReworks: ProductionStepQuotaReworkReference[] = [];
  let classifiedNormal = 0,
    scrapped = 0,
    pendingReview = 0,
    pendingRework = 0,
    doingRework = 0,
    terminated = 0;

  const classifyBranch = (root: BatchStepReportItem): string | null => {
    let report = root;
    while (true) {
      if (visited.has(report.reportId)) return '异常处理链出现重复或循环，请核对相关记录';
      visited.add(report.reportId);
      classifiedNormal = integerQuantity(classifiedNormal + integerQuantity(report.normalQuantity));
      const abnormal = integerQuantity(report.abnormalQuantity),
        disposition = dispositions.get(report.reportId),
        rework = reworks.get(report.reportId),
        scrap = scraps.get(report.reportId);
      if (abnormal === 0)
        return disposition || rework || scrap ? '纯正常报工存在异常处理引用，请核对相关记录' : null;
      if (!disposition || integerQuantity(disposition.sourceAbnormalQuantity) !== abnormal)
        return '异常来源缺少对应处置或数量不一致，请核对相关记录';
      const dispositionRef: ProductionStepQuotaDispositionReference = {
        dispositionId: disposition.dispositionId,
        dispositionNo: disposition.dispositionNo,
        quantity: fixed(abnormal),
        sourceReport: reportReference(report),
      };
      if (
        disposition.reviewStatus === 'pending_review' ||
        disposition.reviewStatus === 'terminated'
      ) {
        if (disposition.dispositionType !== null || rework || scrap)
          return '异常处置状态与下游事实不一致，请核对相关记录';
        if (disposition.reviewStatus === 'pending_review') {
          pendingReview = integerQuantity(pendingReview + abnormal);
          pendingDispositions.push(dispositionRef);
        } else {
          terminated = integerQuantity(terminated + abnormal);
          terminatedDispositions.push(dispositionRef);
        }
        return null;
      }
      if (disposition.reviewStatus !== 'approved')
        return '存在未冲销的历史驳回或取消异常，无法确定额度去向';
      if (disposition.dispositionType === 'scrap') {
        if (
          !scrap ||
          rework ||
          scrap.dispositionId !== disposition.dispositionId ||
          scrap.unit !== report.unit ||
          integerQuantity(scrap.quantity) !== abnormal
        )
          return '报废事实与来源异常不一致，请核对相关记录';
        scrapped = integerQuantity(scrapped + integerQuantity(scrap.quantity));
        visitedScraps.add(scrap.scrapRecordId);
        return null;
      }
      if (
        disposition.dispositionType !== 'rework' ||
        !rework ||
        scrap ||
        rework.abnormalDispositionId !== disposition.dispositionId ||
        rework.unit !== report.unit ||
        integerQuantity(rework.reworkQuantity) !== abnormal
      )
        return '返工事实与来源异常不一致，请核对相关记录';
      visitedReworks.add(rework.reworkId);
      const reworkRef: ProductionStepQuotaReworkReference = {
        ...dispositionRef,
        reworkId: rework.reworkId,
        reworkNo: rework.reworkNo,
      };
      if (rework.status !== 'completed') {
        if (rework.completedNormalReportId !== null || rework.completedAbnormalReportId !== null)
          return '未完成返工存在完成报工引用，请核对相关记录';
        if (rework.status === 'pending') {
          pendingRework = integerQuantity(pendingRework + abnormal);
          pendingReworks.push(reworkRef);
        } else if (rework.status === 'doing') {
          doingRework = integerQuantity(doingRework + abnormal);
          doingReworks.push(reworkRef);
        } else if (rework.status === 'cancelled') {
          terminated = integerQuantity(terminated + abnormal);
          cancelledReworks.push(reworkRef);
        } else {
          return '返工状态无法确定额度去向，请核对相关记录';
        }
        return null;
      }
      const completedNormal =
        rework.completedNormalReportId === null
          ? null
          : reports.get(rework.completedNormalReportId);
      const completedAbnormal =
        rework.completedAbnormalReportId === null
          ? null
          : reports.get(rework.completedAbnormalReportId);
      const validCompletion = (completed: BatchStepReportItem | null | undefined): boolean =>
        completed !== null &&
        completed !== undefined &&
        completed.reportType === 'normal' &&
        !reversed.has(completed.reportId) &&
        completed.correctionOfReportId === null &&
        completed.unit === report.unit &&
        completedBy.get(completed.reportId)?.reworkId === rework.reworkId;
      if (
        (rework.completedNormalReportId !== null &&
          (!validCompletion(completedNormal) ||
            !completedNormal ||
            integerQuantity(completedNormal.normalQuantity) <= 0 ||
            integerQuantity(completedNormal.abnormalQuantity) !== 0 ||
            completedNormal.abnormalOrigin !== null)) ||
        (rework.completedAbnormalReportId !== null &&
          (!validCompletion(completedAbnormal) ||
            !completedAbnormal ||
            integerQuantity(completedAbnormal.normalQuantity) !== 0 ||
            integerQuantity(completedAbnormal.abnormalQuantity) <= 0 ||
            completedAbnormal.abnormalOrigin !== 'current_step')) ||
        integerQuantity(completedNormal?.normalQuantity ?? 0) +
          integerQuantity(completedAbnormal?.abnormalQuantity ?? 0) !==
          abnormal
      )
        return '返工完成结果缺失、被冲销或数量不一致，请核对相关记录';
      if (completedNormal) {
        if (visited.has(completedNormal.reportId))
          return '异常处理链出现重复或循环，请核对相关记录';
        if (
          dispositions.has(completedNormal.reportId) ||
          reworks.has(completedNormal.reportId) ||
          scraps.has(completedNormal.reportId)
        )
          return '纯正常报工存在异常处理引用，请核对相关记录';
        visited.add(completedNormal.reportId);
        classifiedNormal = integerQuantity(
          classifiedNormal + integerQuantity(completedNormal.normalQuantity),
        );
      }
      if (!completedAbnormal) return null;
      report = completedAbnormal;
    }
  };
  let direct = 0;
  for (const report of facts.reports) {
    if (
      report.reportType !== 'normal' ||
      reversed.has(report.reportId) ||
      completedBy.has(report.reportId)
    )
      continue;
    direct = integerQuantity(direct + integerQuantity(report.reportedQuantity));
    const reason = classifyBranch(report);
    if (reason) return unavailable(reason);
  }
  // 不能用总量偶然相等掩盖孤立完成事实或失效来源上的真实下游依赖。
  if (
    facts.reports.some(
      (report) =>
        report.reportType === 'normal' &&
        !reversed.has(report.reportId) &&
        !visited.has(report.reportId),
    ) ||
    facts.reworks.some((rework) => !visitedReworks.has(rework.reworkId)) ||
    facts.scraps.some((scrap) => !visitedScraps.has(scrap.scrapRecordId)) ||
    facts.dispositions.some(
      (item) =>
        !visited.has(item.sourceReportId) &&
        (!reversed.has(item.sourceReportId) ||
          !['rejected', 'cancelled'].includes(item.reviewStatus)),
    )
  )
    return unavailable('异常处理链存在孤立或失效来源引用，请核对相关记录');
  const processing = integerQuantity(pendingReview + pendingRework + doingRework);
  const available = integerQuantity(facts.availableQuantity),
    upper = integerQuantity(facts.upperLimitQuantity);
  if (
    direct !== integerQuantity(facts.directReportedQuantity) ||
    classifiedNormal !== integerQuantity(facts.normalQuantity) ||
    direct < 0 ||
    direct > upper ||
    available < 0 ||
    classifiedNormal + scrapped + processing + terminated !== direct ||
    direct + available !== upper
  )
    return unavailable('分类数量与报工额度不一致，请核对历史记录');
  return {
    scrappedQuantity: fixed(scrapped),
    processingQuantity: fixed(processing),
    terminatedQuantity: fixed(terminated),
    pendingReviewQuantity: fixed(pendingReview),
    pendingReworkQuantity: fixed(pendingRework),
    doingReworkQuantity: fixed(doingRework),
    isReliable: true,
    unavailableReason: null,
    pendingDispositions,
    pendingReworks,
    doingReworks,
    terminatedDispositions,
    cancelledReworks,
  };
}
