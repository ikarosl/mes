import type {
  CreateProductionOutputInboundPayload,
  PageResult,
  ProductionOutputInboundResult,
  ProductionOutputItem,
  ProductionOutputQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionOutputRepository {
  abstract list(query: ProductionOutputQuery): Promise<PageResult<ProductionOutputItem>>;
  abstract revoke(
    outputId: string,
    reason: string,
    context: CommandContext,
  ): Promise<ProductionOutputItem>;
  abstract inbound(
    batchId: string,
    payload: CreateProductionOutputInboundPayload,
    context: CommandContext,
  ): Promise<ProductionOutputInboundResult>;
}
