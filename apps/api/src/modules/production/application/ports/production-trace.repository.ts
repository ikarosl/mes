import type {
  PageResult,
  ProductionTraceBatchSummary,
  ProductionTraceInventoryTransaction,
  ProductionTraceQuery,
  ProductionTraceWorkOrderGroup,
  ProductionTraceDetail,
} from '@company/contracts';

export abstract class ProductionTraceRepository {
  abstract search(query: ProductionTraceQuery): Promise<PageResult<ProductionTraceWorkOrderGroup>>;
  abstract getSummary(batchId: string): Promise<ProductionTraceBatchSummary>;
  abstract listInventoryTransactions(
    batchId: string,
  ): Promise<ProductionTraceInventoryTransaction[]>;
  abstract listMaterialInboundSources(
    batchId: string,
  ): Promise<ProductionTraceDetail['materialInboundSources']>;
}
