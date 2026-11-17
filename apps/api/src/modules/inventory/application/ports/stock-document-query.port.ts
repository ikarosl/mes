import type {
  PageResult,
  StockDocumentDirection,
  StockDocumentOrder,
  StockDocumentQuery,
  StockDocumentSourceType,
} from '@company/contracts';

export abstract class StockDocumentQueryPort {
  abstract list(
    query: StockDocumentQuery,
    allowedSources: readonly StockDocumentSourceType[],
  ): Promise<PageResult<StockDocumentOrder>>;
  abstract get(
    direction: StockDocumentDirection,
    id: string,
    allowedSources: readonly StockDocumentSourceType[],
  ): Promise<StockDocumentOrder>;
}
