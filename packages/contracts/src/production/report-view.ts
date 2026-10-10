import type { BatchStepReportDependency, BatchStepReportItem } from './execution.js';
import type { BatchStepAbnormalDispositionItem, ReworkRecordItem } from './abnormal.js';

/** 只读展示分类；不替代报工事实类型或命令资格。 */
export type BatchStepReportSourceKind =
  'direct_normal' | 'direct_abnormal' | 'direct_mixed' | 'rework_completion' | 'reversal';

export interface BatchStepReportReference {
  reportId: string;
  reportNo: string;
  productionBatchId: string;
  stepRecordId: string;
}

export interface BatchStepReportDependencyView extends BatchStepReportDependency {
  /** 报废事实没有独立业务编号，为 null；不得按事实 ID 拼造单号。 */
  businessNo: string | null;
}

export interface BatchStepAbnormalDispositionView extends BatchStepAbnormalDispositionItem {
  sourceReportNo: string;
  sourceReportSourceKind: BatchStepReportSourceKind;
}

export interface ReworkRecordView extends ReworkRecordItem {
  abnormalDispositionNo: string;
  sourceReportNo: string;
  completedNormalReportNo: string | null;
  completedAbnormalReportNo: string | null;
  completedNormalQuantity: string | null;
  completedAbnormalQuantity: string | null;
}

/** 列表与详情专用；写命令及其幂等快照继续使用 BatchStepReportItem。 */
export interface BatchStepReportView extends BatchStepReportItem {
  sourceKind: BatchStepReportSourceKind;
  reversalOfReport: BatchStepReportReference | null;
  correctionOfReport: BatchStepReportReference | null;
  reversalReport: BatchStepReportReference | null;
  replacementReport: BatchStepReportReference | null;
  reworkOrigin: ReworkRecordView | null;
  dependencies: BatchStepReportDependencyView[];
}

/** 当前报工来源返工与本身异常处置的真实片段，可沿报工引用逐笔导航。 */
export interface BatchStepReportProcessingChainItem {
  sourceReport: BatchStepReportReference;
  disposition: BatchStepAbnormalDispositionView;
  rework: ReworkRecordView | null;
  completedNormalReport: BatchStepReportReference | null;
  completedAbnormalReport: BatchStepReportReference | null;
}

export interface BatchStepReportDetail extends BatchStepReportView {
  processingChain: BatchStepReportProcessingChainItem[];
}
