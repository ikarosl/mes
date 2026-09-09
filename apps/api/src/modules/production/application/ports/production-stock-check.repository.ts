import type {
  CreateStockCheckPayload,
  PageResult,
  SaveStockCheckCountsPayload,
  StockCheckCandidateItem,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionStockCheckRepository {
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
    reason: string,
    context: CommandContext,
  ): Promise<StockCheckOrderItem>;
}
