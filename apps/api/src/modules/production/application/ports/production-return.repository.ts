import type {
  CreateReturnOrderPayload,
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionReturnRepository {
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
    reason: string,
    context: CommandContext,
  ): Promise<ReturnOrderItem>;
}
