import { Injectable } from '@nestjs/common';
import type {
  CreatePurchaseInboundPayload,
  InventoryBatchQuery,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { normalizePurchaseInboundPayload } from '@company/utils';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import {
  confirmPurchaseInboundResultCodec,
  createPurchaseInboundResultCodec,
} from './idempotency/production-inbound-result.codec.js';
import { ProductionInboundRepository } from './ports/production-inbound.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { assertValidPurchaseInboundDraft } from '../domain/production-inbound.policy.js';

@Injectable()
export class ProductionInboundService {
  constructor(
    private readonly repository: ProductionInboundRepository,
    private readonly products: ProductSnapshotQuery,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async list(query: PurchaseInboundOrderQuery) {
    const result = await this.repository.list(query);
    return { ...result, items: await this.enrichMany(result.items) };
  }
  async get(id: string) {
    return this.enrich(await this.repository.get(id));
  }
  async create(payload: CreatePurchaseInboundPayload, context: IdempotentCommandContext) {
    const normalized = normalizePurchaseInboundPayload(payload);
    assertValidPurchaseInboundDraft(normalized);
    const command = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CREATE_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body: normalized },
      resultCodec: createPurchaseInboundResultCodec,
      handler: async () => {
        const ids = [...new Set(normalized.details.map((x) => x.itemId))];
        const snapshots = await this.products.listInventoryItemReferencesByIds(ids);
        if (
          snapshots.length !== ids.length ||
          snapshots.some((item) => item.itemKind !== 'material')
        )
          throw new ProductionDomainError('NOT_FOUND', '存在无效或已失效物料');
        return this.enrich(await this.repository.create(normalized, snapshots, command));
      },
    });
    return execution.result;
  }
  async confirm(id: string, version: number, context: IdempotentCommandContext) {
    const command = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CONFIRM_PURCHASE_INBOUND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { inboundId: id }, body: { version } },
      resultCodec: confirmPurchaseInboundResultCodec,
      handler: async () => this.enrich(await this.repository.confirm(id, version, command)),
    });
    return execution.result;
  }
  async cancel(id: string, version: number, reason: string, context: CommandContext) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new ProductionDomainError('INVALID_INPUT', '取消原因不能为空');
    return this.enrich(await this.repository.cancel(id, version, normalizedReason, context));
  }
  listInventory(query: InventoryBatchQuery) {
    return this.repository.listInventory(query);
  }
  getInventory(id: string) {
    return this.repository.getInventory(id);
  }
  private async enrich(row: PurchaseInboundOrderItem) {
    return (await this.enrichMany([row]))[0]!;
  }
  private async enrichMany(rows: PurchaseInboundOrderItem[]) {
    if (rows.length === 0) return rows;
    const ids = rows
      .flatMap((row) => [row.operatorId, row.createdById, row.cancelledById])
      .filter((x): x is string => Boolean(x));
    const users = await this.identity.listUserReferencesByIds([...new Set(ids)]);
    const map = new Map(users.map((x) => [x.id, x.displayName]));
    return rows.map((row) => ({
      ...row,
      operatorName: row.operatorId ? (map.get(row.operatorId) ?? null) : null,
      createdByName: row.createdById ? (map.get(row.createdById) ?? null) : null,
      cancelledByName: row.cancelledById ? (map.get(row.cancelledById) ?? null) : null,
    }));
  }
}
const narrow = (x: IdempotentCommandContext): CommandContext => ({
  actorId: x.actorId,
  requestId: x.requestId,
  ip: x.ip,
  userAgent: x.userAgent,
});
