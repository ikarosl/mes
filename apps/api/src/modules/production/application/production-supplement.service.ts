import { Injectable } from '@nestjs/common';
import type { ApproveScrapSupplementPayload } from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { APPROVE_SCRAP_SUPPLEMENT_IDEMPOTENCY_SCOPE } from './idempotency/approve-scrap-supplement-idempotency.contract.js';
import { productionSupplementResultCodec } from './idempotency/production-supplement-result.codec.js';
import { ProductionSupplementRepository } from './ports/production-supplement.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';

@Injectable()
export class ProductionSupplementService {
  constructor(
    private readonly repository: ProductionSupplementRepository,
    private readonly products: ProductSnapshotQuery,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listCandidates(dispositionId: string) {
    return this.enrich(await this.availableCandidates(dispositionId));
  }

  async approve(
    dispositionId: string,
    payload: ApproveScrapSupplementPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = {
      version: payload.version,
      remark: payload.remark?.trim() || null,
      details: payload.details.map((line) => ({
        originalDemandId: line.originalDemandId,
        supplementQuantity: line.supplementQuantity,
      })),
    };
    const execution = await this.idempotency.execute({
      scope: APPROVE_SCRAP_SUPPLEMENT_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { dispositionId }, body: normalized },
      resultCodec: productionSupplementResultCodec,
      handler: async () => {
        const candidates = await this.availableCandidates(dispositionId);
        const allowed = new Set(candidates.map((row) => row.originalDemandId));
        if (normalized.details.some((line) => !allowed.has(line.originalDemandId)))
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '补料物料不属于异常工序绑定物料或当前产品有效 BOM',
          );
        const result = await this.repository.approve(dispositionId, normalized, {
          actorId: context.actorId,
          requestId: context.requestId,
          ip: context.ip,
          userAgent: context.userAgent,
        });
        const details = await this.enrich(
          result.supplement.details.map((line) => ({
            originalDemandId: line.originalDemandId,
            productionBatchId: result.supplement.productionBatchId,
            productMaterialId: line.productMaterialId,
            itemId: line.itemId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            unit: line.unit,
            normalDemandQuantity: line.supplementQuantity,
          })),
        );
        return {
          ...result,
          supplement: {
            ...result.supplement,
            details: result.supplement.details.map((line, index) => ({
              ...line,
              itemCode: details[index]?.itemCode ?? '',
              itemName: details[index]?.itemName ?? '',
            })),
          },
        };
      },
    });
    return execution.result;
  }

  private async enrich<T extends { itemId: string; itemCode: string; itemName: string }>(
    rows: T[],
  ) {
    const references = await this.products.listInventoryItemReferencesByIds([
      ...new Set(rows.map((row) => row.itemId)),
    ]);
    const byId = new Map(references.map((row) => [row.id, row]));
    return rows.map((row) => ({
      ...row,
      itemCode: byId.get(row.itemId)?.itemCode ?? row.itemCode,
      itemName: byId.get(row.itemId)?.productName ?? row.itemName,
    }));
  }

  private async availableCandidates(dispositionId: string) {
    const context = await this.repository.getCandidateContext(dispositionId);
    const routeMaterialIds = await this.products.listRouteStepMaterialIds(context.routeStepId);
    if (routeMaterialIds.length === 0) return context.candidates;
    const allowed = new Set(routeMaterialIds);
    return context.candidates.filter((row) => allowed.has(row.productMaterialId));
  }
}
