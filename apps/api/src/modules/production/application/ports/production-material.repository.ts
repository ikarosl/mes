import type {
  AvailableItemBatchItem,
  CreateMaterialAllocationsPayload,
  MaterialAllocationCommandResult,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
  ShortBatchAuthorizationPreview,
  ShortBatchAuthorizationResult,
  CloseRemainingMaterialDemandsResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionMaterialRepository {
  abstract listDemands(batchId: string): Promise<ProductionMaterialDemandItem[]>;
  abstract listAvailableItemBatches(demandId: string): Promise<AvailableItemBatchItem[]>;
  abstract getShortBatchAuthorizationPreview(
    batchId: string,
  ): Promise<ShortBatchAuthorizationPreview>;
  abstract authorizeShortBatch(
    batchId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<ShortBatchAuthorizationResult>;
  abstract closeRemainingDemands(
    batchId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<CloseRemainingMaterialDemandsResult>;
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
}
