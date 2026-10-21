import type { BatchStepReportReference } from './report-view.js';

export interface ProductionStepQuotaDispositionReference {
  dispositionId: string;
  dispositionNo: string;
  quantity: string;
  sourceReport: BatchStepReportReference;
}

export interface ProductionStepQuotaReworkReference extends ProductionStepQuotaDispositionReference {
  reworkId: string;
  reworkNo: string;
}

/** 与工序 N/U/available 同一只读快照；不用于写入资格或库存余额。 */
export interface ProductionStepQuotaDistribution {
  /** 未知来源链时各分类量为 null，不用差额补平处理中。 */
  scrappedQuantity: string | null;
  processingQuantity: string | null;
  /** 有明确终止／返工取消事实且尚未恢复的异常，独立于处理中。 */
  terminatedQuantity: string | null;
  pendingReviewQuantity: string | null;
  pendingReworkQuantity: string | null;
  doingReworkQuantity: string | null;
  /** true 时 N + S + P + T + available = U，且来源链完整、分类互斥。 */
  isReliable: boolean;
  unavailableReason: string | null;
  pendingDispositions: ProductionStepQuotaDispositionReference[];
  pendingReworks: ProductionStepQuotaReworkReference[];
  doingReworks: ProductionStepQuotaReworkReference[];
  terminatedDispositions: ProductionStepQuotaDispositionReference[];
  cancelledReworks: ProductionStepQuotaReworkReference[];
}
