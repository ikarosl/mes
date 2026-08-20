import type {
  CreateReturnOrderPayload,
  CreateStockCheckPayload,
  CreateMaterialLossPayload,
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  MaterialLossQuery,
  PageResult,
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
  ReturnOrderQuery,
  SaveStockCheckCountsPayload,
  StockCheckCandidateItem,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionInventoryRepository {
  abstract listMaterialLosses(query: MaterialLossQuery): Promise<PageResult<MaterialLossItem>>;
  abstract getMaterialLoss(scrapId: string): Promise<MaterialLossItem>;
  abstract listMaterialLossBatchOptions(): Promise<MaterialLossBatchOption[]>;
  abstract listMaterialLossCandidates(batchId: string): Promise<MaterialLossCandidateItem[]>;
  abstract createMaterialLoss(
    payload: CreateMaterialLossPayload,
    context: CommandContext,
  ): Promise<MaterialLossItem>;
  abstract confirmMaterialLoss(
    scrapId: string,
    version: number,
    context: CommandContext,
  ): Promise<MaterialLossItem>;
  abstract cancelMaterialLoss(
    scrapId: string,
    version: number,
    context: CommandContext,
  ): Promise<MaterialLossItem>;

  abstract listReturnOrders(query: ReturnOrderQuery): Promise<PageResult<ReturnOrderItem>>;
  abstract getReturnOrder(returnId: string): Promise<ReturnOrderItem>;
  abstract listReturnBatchOptions(): Promise<ReturnOrderBatchOption[]>;
  abstract listReturnCandidates(batchId: string): Promise<ReturnOrderCandidateItem[]>;
  abstract createReturnOrder(
    payload: CreateReturnOrderPayload,
    context: CommandContext,
  ): Promise<ReturnOrderItem>;
  abstract confirmReturnOrder(
    returnId: string,
    version: number,
    context: CommandContext,
  ): Promise<ReturnOrderItem>;
  abstract cancelReturnOrder(
    returnId: string,
    version: number,
    context: CommandContext,
  ): Promise<ReturnOrderItem>;

  abstract listStockChecks(query: StockCheckOrderQuery): Promise<PageResult<StockCheckOrderItem>>;
  abstract getStockCheck(stockCheckId: string): Promise<StockCheckOrderItem>;
  abstract listStockCheckCandidates(
    query: StockCheckCandidateQuery,
  ): Promise<PageResult<StockCheckCandidateItem>>;
  abstract createStockCheck(
    payload: CreateStockCheckPayload,
    context: CommandContext,
  ): Promise<StockCheckOrderItem>;
  abstract saveStockCheckCounts(
    stockCheckId: string,
    payload: SaveStockCheckCountsPayload,
    context: CommandContext,
  ): Promise<StockCheckOrderItem>;
  abstract completeStockCheck(
    stockCheckId: string,
    version: number,
    context: CommandContext,
  ): Promise<StockCheckOrderItem>;
  abstract cancelStockCheck(
    stockCheckId: string,
    version: number,
    context: CommandContext,
  ): Promise<StockCheckOrderItem>;
}
