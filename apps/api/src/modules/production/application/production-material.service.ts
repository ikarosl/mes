import { Injectable } from '@nestjs/common';
import type { CreateMaterialAllocationsPayload } from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { materialAllocationResultCodec } from './idempotency/production-material-result.codec.js';
import { ProductionMaterialRepository } from './ports/production-material.repository.js';

@Injectable()
export class ProductionMaterialService {
  constructor(
    private readonly materials: ProductionMaterialRepository,
    private readonly products: ProductSnapshotQuery,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listDemands(batchId: string) {
    const rows = await this.materials.listDemands(batchId);
    const references = await this.products.listInventoryItemDisplayReferencesByIds([
      ...new Set(rows.map((row) => row.itemId)),
    ]);
    const byId = new Map(references.map((item) => [item.id, item]));
    return rows.map((row) => ({
      ...row,
      itemCode: byId.get(row.itemId)?.itemCode ?? row.itemCode,
      itemName: byId.get(row.itemId)?.productName ?? row.itemName,
    }));
  }
  listAvailableItemBatches(demandId: string) {
    return this.materials.listAvailableItemBatches(demandId);
  }
  getShortBatchAuthorizationPreview(batchId: string) {
    return this.materials.getShortBatchAuthorizationPreview(batchId);
  }
  authorizeShortBatch(batchId: string, version: number, reason: string, context: CommandContext) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new ProductionDomainError('INVALID_INPUT', '短批授权原因不能为空');
    return this.materials.authorizeShortBatch(batchId, version, normalizedReason, context);
  }
  closeRemainingDemands(batchId: string, version: number, reason: string, context: CommandContext) {
    const normalizedReason = reason.trim();
    if (!normalizedReason)
      throw new ProductionDomainError('INVALID_INPUT', '关闭剩余物料需求的原因不能为空');
    return this.materials.closeRemainingDemands(batchId, version, normalizedReason, context);
  }
  async createAllocations(
    batchId: string,
    payload: CreateMaterialAllocationsPayload,
    context: IdempotentCommandContext,
  ) {
    if (new Set(payload.allocations.map((line) => line.demandId)).size !== 1)
      throw new ProductionDomainError('INVALID_INPUT', '一次只能为一条物料需求分配库存');
    const normalized = {
      allocations: payload.allocations.map((line) => ({
        demandId: line.demandId,
        itemBatchId: line.itemBatchId,
        assignedQuantity: line.assignedQuantity,
        remark: line.remark?.trim() || null,
      })),
    };
    const commandContext = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: normalized },
      resultCodec: materialAllocationResultCodec,
      handler: () => this.materials.createAllocations(batchId, normalized, commandContext),
    });
    return execution.result;
  }
  releaseAllocation(
    batchId: string,
    allocationId: string,
    version: number,
    context: CommandContext,
  ) {
    return this.materials.releaseAllocation(batchId, allocationId, version, context);
  }
}

const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
