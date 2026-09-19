import type {
  PageResult,
  ProcurementDemandCandidate,
  ProcurementDemandCandidateQuery,
  ProcurementDemandResolution,
} from '@company/contracts';

export type ProductionProcurementResult<T> =
  | { status: 'success'; value: T }
  | {
      status: 'invalid-input' | 'not-found' | 'not-purchasable' | 'concurrent-modification';
      message: string;
      demandId?: string;
    };

export abstract class ProductionProcurementQuery {
  abstract listCandidates(
    query: ProcurementDemandCandidateQuery,
  ): Promise<PageResult<ProcurementDemandCandidate>>;

  /** 最多 100 个 ID，按请求顺序返回，历史来源不受候选窗口限制。 */
  abstract resolveDemands(input: { demandIds: string[] }): Promise<ProcurementDemandResolution[]>;

  /**
   * 必须处于调用方的同池事务中；按工单、任务、需求顺序锁定当前事实。
   * 仅校验 Production 来源资格，不锁 Product、不改需求、不分摊采购量。
   */
  abstract requirePurchasableDemands(input: {
    demandIds: string[];
  }): Promise<ProductionProcurementResult<ProcurementDemandCandidate[]>>;
}
