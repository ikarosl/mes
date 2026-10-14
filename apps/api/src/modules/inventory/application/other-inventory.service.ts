import { Injectable } from '@nestjs/common';
import type {
  OtherInventoryDirection,
  OtherInventoryDraftPayload,
  OtherInventoryOrder,
  OtherInventoryOrderQuery,
  OtherStockCandidateQuery,
  OtherStockMaterialQuery,
  OtherStockMaterials,
  OtherStockObjectQuery,
  OtherStockObjects,
  SaveOtherInventoryDraftPayload,
} from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdempotencyStorageError } from '../../../common/idempotency/idempotency.errors.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductOtherStockQuery } from '../../product/public.js';
import { OtherInventoryRepository } from './ports/other-inventory.repository.js';
import { OTHER_INVENTORY_SCOPES } from './idempotency/other-inventory-idempotency-scopes.contract.js';
import { otherInventoryResultCodec } from './idempotency/other-inventory-idempotency.js';

@Injectable()
export class OtherInventoryService {
  constructor(
    private readonly repository: OtherInventoryRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly objects: ProductOtherStockQuery,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async list(direction: OtherInventoryDirection, query: OtherInventoryOrderQuery) {
    const result = await this.repository.list(direction, query);
    return { ...result, items: await this.enrich(result.items) };
  }
  async get(direction: OtherInventoryDirection, id: string) {
    return (await this.enrich([await this.repository.get(direction, id)]))[0]!;
  }
  candidates(query: OtherStockCandidateQuery) {
    return this.repository.candidates(query);
  }
  stockMaterials(query: OtherStockMaterialQuery): Promise<OtherStockMaterials> {
    return this.objects.listMaterials(query);
  }
  stockObjects(query: OtherStockObjectQuery): Promise<OtherStockObjects> {
    return this.objects.listObjects(query);
  }
  create(
    direction: OtherInventoryDirection,
    body: OtherInventoryDraftPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = normalize(body);
    return this.execute(direction, 'create', undefined, normalized, context, () =>
      this.repository.create(direction, normalized, context),
    );
  }
  save(
    direction: OtherInventoryDirection,
    id: string,
    body: SaveOtherInventoryDraftPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = { ...normalize(body), version: body.version };
    return this.execute(direction, 'save', id, normalized, context, () =>
      this.repository.save(direction, id, normalized, context),
    );
  }
  confirm(
    direction: OtherInventoryDirection,
    id: string,
    version: number,
    context: IdempotentCommandContext,
  ) {
    return this.execute(direction, 'confirm', id, { version }, context, () =>
      this.repository.confirm(direction, id, version, context),
    );
  }
  cancel(
    direction: OtherInventoryDirection,
    id: string,
    version: number,
    reason: string,
    context: IdempotentCommandContext,
  ) {
    return this.execute(direction, 'cancel', id, { version, reason: reason.trim() }, context, () =>
      this.repository.cancel(direction, id, version, reason.trim(), context),
    );
  }
  private async execute(
    direction: OtherInventoryDirection,
    action: keyof typeof OTHER_INVENTORY_SCOPES.inbound,
    id: string | undefined,
    body: unknown,
    context: IdempotentCommandContext,
    handler: () => Promise<OtherInventoryOrder>,
  ): Promise<OtherInventoryOrder> {
    for (let attempt = 0; ; attempt++) {
      try {
        const execution = await this.idempotency.execute({
          scope: OTHER_INVENTORY_SCOPES[direction][action],
          key: context.idempotencyKey,
          actorId: context.actorId,
          requestId: context.requestId,
          request: { ...(id ? { params: { orderId: id } } : {}), body },
          resultCodec: otherInventoryResultCodec,
          handler: async () => (await this.enrich([await handler()]))[0]!,
        });
        return execution.result;
      } catch (error) {
        // executor 已结束整个事务；原键、原语义重新登记，未知提交结果亦由幂等记录仲裁。
        if (
          !(error instanceof IdempotencyStorageError) ||
          error.kind !== 'retryable' ||
          attempt >= 2
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }
  private async enrich(items: OtherInventoryOrder[]): Promise<OtherInventoryOrder[]> {
    const ids = [
      ...new Set(
        items
          .flatMap((row) => [row.createdById, row.operatorId, row.cancelledById])
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const names = new Map(
      (await this.identity.listUserReferencesByIds(ids)).map((user) => [user.id, user.displayName]),
    );
    return items.map((row) => ({
      ...row,
      createdByName: names.get(row.createdById) ?? null,
      operatorName: row.operatorId ? (names.get(row.operatorId) ?? null) : null,
      cancelledByName: row.cancelledById ? (names.get(row.cancelledById) ?? null) : null,
    }));
  }
}
const normalize = (body: OtherInventoryDraftPayload): OtherInventoryDraftPayload => ({
  ...body,
  reason: body.reason.trim(),
  remark: body.remark?.trim() || null,
  details: body.details.map((line) => ({
    ...line,
    remark: line.remark?.trim() || null,
    target:
      line.target.mode === 'new'
        ? { ...line.target, clientKey: line.target.clientKey.trim() }
        : { ...line.target },
  })),
});
