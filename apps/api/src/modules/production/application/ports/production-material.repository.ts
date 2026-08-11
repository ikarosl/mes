import type {
  AvailableItemBatchItem,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  MaterialAllocationCommandResult,
  MaterialOutboundCommandResult,
  MaterialOutboundItem,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionMaterialRepository {
  abstract listDemands(batchId: string): Promise<ProductionMaterialDemandItem[]>;
  abstract listAvailableItemBatches(demandId: string): Promise<AvailableItemBatchItem[]>;
  abstract createAllocations(
    batchId: string,
    payload: CreateMaterialAllocationsPayload,
    context: CommandContext,
  ): Promise<MaterialAllocationCommandResult>;
  abstract releaseAllocation(
    batchId: string,
    allocationId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionMaterialAllocationItem>;
  abstract createOutbound(
    batchId: string,
    payload: CreateMaterialOutboundPayload,
    context: CommandContext,
  ): Promise<MaterialOutboundCommandResult>;
  abstract listOutbounds(batchId: string): Promise<MaterialOutboundItem[]>;
}
