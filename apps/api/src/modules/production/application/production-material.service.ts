import { Injectable } from '@nestjs/common';
import type {
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  MaterialOutboundItem,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from './idempotency/create-material-allocation-idempotency.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './idempotency/create-material-outbound-idempotency.contract.js';
import {
  materialAllocationResultCodec,
  materialOutboundResultCodec,
} from './idempotency/production-material-result.codec.js';
import { ProductionMaterialRepository } from './ports/production-material.repository.js';

@Injectable()
export class ProductionMaterialService {
  constructor(
    private readonly materials: ProductionMaterialRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly products: ProductSnapshotQuery,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listDemands(batchId: string) {
    const rows = await this.materials.listDemands(batchId);
    const references = await this.products.listInventoryItemReferencesByIds([
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
  async createAllocations(
    batchId: string,
    payload: CreateMaterialAllocationsPayload,
    context: IdempotentCommandContext,
  ) {
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
  async createOutbound(
    batchId: string,
    payload: CreateMaterialOutboundPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = {
      details: payload.details.map((line) => ({
        allocationId: line.allocationId,
        outboundQuantity: line.outboundQuantity,
      })),
      remark: payload.remark?.trim() || null,
    };
    const commandContext = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: normalized },
      resultCodec: materialOutboundResultCodec,
      handler: async () => {
        const result = await this.materials.createOutbound(batchId, normalized, commandContext);
        return { ...result, outbound: await this.enrichOutbound(result.outbound) };
      },
    });
    return execution.result;
  }
  async listOutbounds(batchId: string) {
    return Promise.all(
      (await this.materials.listOutbounds(batchId)).map((row) => this.enrichOutbound(row)),
    );
  }
  private async enrichOutbound(row: MaterialOutboundItem): Promise<MaterialOutboundItem> {
    const users = await this.identity.listUserReferencesByIds([row.operatorId]);
    return { ...row, operatorName: users[0]?.displayName ?? null };
  }
}

const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
