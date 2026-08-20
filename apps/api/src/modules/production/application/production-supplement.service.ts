import { Injectable } from '@nestjs/common';
import type {
  ConfirmProductionScrapSupplementPlanPayload,
  SaveProductionScrapSupplementPlanPayload,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { productionSupplementResultCodec } from './idempotency/production-supplement-result.codec.js';
import { CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE } from './idempotency/confirm-scrap-supplement-plan-idempotency.contract.js';
import { ProductionSupplementRepository } from './ports/production-supplement.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';

@Injectable()
export class ProductionSupplementService {
  constructor(
    private readonly repository: ProductionSupplementRepository,
    private readonly products: ProductSnapshotQuery,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listCandidates(dispositionId: string, materialEndStepRecordId: string) {
    return this.enrich(await this.availableCandidates(dispositionId, materialEndStepRecordId));
  }

  async getPlan(dispositionId: string) {
    const plan = await this.repository.getPlan(dispositionId);
    if (!plan) return null;
    const lines = await this.enrich(plan.lines);
    return { ...plan, lines };
  }

  async savePlan(
    dispositionId: string,
    payload: SaveProductionScrapSupplementPlanPayload,
    context: CommandContext,
  ) {
    const normalized = {
      planVersion: payload.planVersion,
      dispositionVersion: payload.dispositionVersion,
      materialEndStepRecordId: payload.materialEndStepRecordId,
      remark: payload.remark?.trim() || null,
      details: payload.details.map((line) => ({
        originalDemandId: line.originalDemandId,
        supplementQuantity: line.supplementQuantity,
      })),
    };
    const candidates = await this.availableCandidates(
      dispositionId,
      normalized.materialEndStepRecordId,
    );
    const allowed = new Set(candidates.map((row) => row.originalDemandId));
    if (normalized.details.some((line) => !allowed.has(line.originalDemandId)))
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '补料物料不属于异常工序绑定物料或当前产品有效 BOM',
      );
    const plan = await this.repository.savePlan(dispositionId, normalized, {
      actorId: context.actorId,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    const lines = await this.enrich(plan.lines);
    return { ...plan, lines };
  }

  async confirmPlan(
    dispositionId: string,
    payload: ConfirmProductionScrapSupplementPlanPayload,
    context: IdempotentCommandContext,
  ) {
    const execution = await this.idempotency.execute({
      scope: CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { dispositionId }, body: payload },
      resultCodec: productionSupplementResultCodec,
      handler: async () => {
        const plan = await this.repository.getPlan(dispositionId);
        if (!plan) throw new ProductionDomainError('NOT_FOUND', '报废补料暂存方案不存在');
        if (plan.status !== 'draft')
          throw new ProductionDomainError('INVALID_STATE', '报废补料方案已经确认');
        const candidates = await this.availableCandidates(
          dispositionId,
          plan.materialEndStepRecordId,
        );
        const allowed = new Set(candidates.map((row) => row.originalDemandId));
        if (plan.lines.some((line) => !allowed.has(line.originalDemandId)))
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '暂存方案中的物料已不属于当前有效候选，请重新编辑后确认',
          );
        const result = await this.repository.approve(
          dispositionId,
          {
            version: payload.dispositionVersion,
            materialEndStepRecordId: plan.materialEndStepRecordId,
            details: plan.lines.map((line) => ({
              originalDemandId: line.originalDemandId,
              supplementQuantity: Number(line.plannedQuantity),
            })),
            remark: plan.remark,
          },
          {
            actorId: context.actorId,
            requestId: context.requestId,
            ip: context.ip,
            userAgent: context.userAgent,
          },
          { planId: plan.planId, version: payload.version },
        );
        const demands = await this.enrich(
          result.supplement.demands.map((line) => ({
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
            demands: result.supplement.demands.map((line, index) => ({
              ...line,
              itemCode: demands[index]?.itemCode ?? '',
              itemName: demands[index]?.itemName ?? '',
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

  private async availableCandidates(dispositionId: string, materialEndStepRecordId: string) {
    const context = await this.repository.getCandidateContext(
      dispositionId,
      materialEndStepRecordId,
    );
    const routeMaterialIds = (
      await Promise.all(
        context.routeStepIds.map((routeStepId) =>
          this.products.listRouteStepMaterialIds(routeStepId),
        ),
      )
    ).flat();
    if (routeMaterialIds.length === 0) return context.candidates;
    const allowed = new Set(routeMaterialIds);
    return context.candidates.filter((row) => allowed.has(row.productMaterialId));
  }
}
