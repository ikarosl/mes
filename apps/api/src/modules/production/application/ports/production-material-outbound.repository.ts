import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundCommandResult,
  MaterialOutboundItem,
  MaterialOutboundQuery,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionMaterialOutboundRepository {
  abstract createOutbound(
    batchId: string,
    payload: CreateMaterialOutboundPayload,
    context: CommandContext,
  ): Promise<MaterialOutboundCommandResult>;
  abstract listOutbounds(batchId: string): Promise<MaterialOutboundItem[]>;
  abstract listOutboundOrders(
    query: MaterialOutboundQuery,
  ): Promise<PageResult<MaterialOutboundItem>>;
  abstract getOutbound(outboundId: string): Promise<MaterialOutboundItem>;
  abstract listOutboundBatchOptions(): Promise<MaterialOutboundBatchOption[]>;
  abstract listOutboundCandidates(batchId: string): Promise<MaterialOutboundCandidateItem[]>;
  abstract confirmOutbound(
    outboundId: string,
    version: number,
    context: CommandContext,
  ): Promise<MaterialOutboundCommandResult>;
  abstract cancelOutbound(
    outboundId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<MaterialOutboundItem>;
}
