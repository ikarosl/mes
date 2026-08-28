import { Injectable } from '@nestjs/common';
import type {
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  MaterialOutboundItem,
  MaterialOutboundQuery,
} from '@company/contracts';
import { normalizeMaterialOutboundPayload } from '@company/utils';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import {
  materialAllocationResultCodec,
  materialOutboundResultCodec,
  confirmMaterialOutboundResultCodec,
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
    const normalized = normalizeMaterialOutboundPayload(payload);
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
    return this.enrichOutbounds(await this.materials.listOutbounds(batchId));
  }
  async listOutboundOrders(query: MaterialOutboundQuery) {
    const result = await this.materials.listOutboundOrders(query);
    return {
      ...result,
      items: await this.enrichOutbounds(result.items),
    };
  }
  async getOutbound(outboundId: string) {
    return this.enrichOutbound(await this.materials.getOutbound(outboundId));
  }
  listOutboundBatchOptions() {
    return this.materials.listOutboundBatchOptions();
  }
  listOutboundCandidates(batchId: string) {
    return this.materials.listOutboundCandidates(batchId);
  }
  async confirmOutbound(outboundId: string, version: number, context: IdempotentCommandContext) {
    const commandContext = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { outboundId }, body: { version } },
      resultCodec: confirmMaterialOutboundResultCodec,
      handler: async () => {
        const result = await this.materials.confirmOutbound(outboundId, version, commandContext);
        return { ...result, outbound: await this.enrichOutbound(result.outbound) };
      },
    });
    return execution.result;
  }
  async cancelOutbound(
    outboundId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new ProductionDomainError('INVALID_INPUT', '取消原因不能为空');
    return this.enrichOutbound(
      await this.materials.cancelOutbound(outboundId, version, normalizedReason, context),
    );
  }
  private async enrichOutbound(row: MaterialOutboundItem): Promise<MaterialOutboundItem> {
    return (await this.enrichOutbounds([row]))[0]!;
  }
  private async enrichOutbounds(rows: MaterialOutboundItem[]): Promise<MaterialOutboundItem[]> {
    if (rows.length === 0) return rows;
    const ids = rows
      .flatMap((row) => [row.operatorId, row.createdById, row.cancelledById])
      .filter((id): id is string => Boolean(id));
    const users = await this.identity.listUserReferencesByIds([...new Set(ids)]);
    const byId = new Map(users.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      ...row,
      operatorName: row.operatorId ? (byId.get(row.operatorId) ?? null) : null,
      createdByName: row.createdById ? (byId.get(row.createdById) ?? null) : null,
      cancelledByName: row.cancelledById ? (byId.get(row.cancelledById) ?? null) : null,
    }));
  }
}

const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
