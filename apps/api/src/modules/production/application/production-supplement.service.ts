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
import { productionSupplementResultCodec } from './idempotency/production-supplement-result.codec.js';
import { CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { ProductionSupplementRepository } from './ports/production-supplement.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';

@Injectable()
export class ProductionSupplementService {
  constructor(
    private readonly repository: ProductionSupplementRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async listCandidates(dispositionId: string) {
    return this.availableCandidates(dispositionId);
  }

  async getPlan(dispositionId: string) {
    return this.repository.getPlan(dispositionId);
  }

  async savePlan(
    dispositionId: string,
    payload: SaveProductionScrapSupplementPlanPayload,
    context: CommandContext,
  ) {
    const normalized = {
      planVersion: payload.planVersion,
      dispositionVersion: payload.dispositionVersion,
      remark: payload.remark?.trim() || null,
      details: payload.details.map((line) => ({
        originalDemandId: line.originalDemandId,
        requirementBasisId: line.requirementBasisId,
        materialVariantId: line.materialVariantId,
        supplementQuantity: line.supplementQuantity,
      })),
    };
    const candidates = await this.availableCandidates(dispositionId);
    const allowed = new Map(candidates.map((row) => [row.requirementBasisId, row]));
    if (
      normalized.details.some((line) => {
        const candidate = allowed.get(line.requirementBasisId);
        return (
          !candidate ||
          candidate.originalDemandId !== line.originalDemandId ||
          !candidate.variants.some((variant) => variant.id === line.materialVariantId)
        );
      })
    )
      throw new ProductionDomainError('INVALID_INPUT', '补料物料不属于当前批次的 BOM 需求');
    return this.repository.savePlan(dispositionId, normalized, {
      actorId: context.actorId,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async confirmPlan(
    dispositionId: string,
    payload: ConfirmProductionScrapSupplementPlanPayload,
    context: IdempotentCommandContext,
  ) {
    // HTTP ValidationPipe 会把请求体转换为 DTO 类实例；幂等指纹只接受稳定的普通 JSON 结构。
    // 在应用层显式挑选参与命令语义的字段，也避免未来 DTO 新增展示/传输字段时意外改变既有指纹。
    const normalized = {
      version: payload.version,
      dispositionVersion: payload.dispositionVersion,
    };
    const execution = await this.idempotency.execute({
      scope: CONFIRM_SCRAP_SUPPLEMENT_PLAN_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { dispositionId }, body: normalized },
      resultCodec: productionSupplementResultCodec,
      handler: async () => {
        const plan = await this.repository.getPlan(dispositionId);
        if (!plan) throw new ProductionDomainError('NOT_FOUND', '报废补料暂存方案不存在');
        if (plan.status !== 'draft')
          throw new ProductionDomainError('INVALID_STATE', '报废补料方案已经确认');
        const candidates = await this.availableCandidates(dispositionId);
        const allowed = new Map(candidates.map((row) => [row.requirementBasisId, row]));
        if (
          plan.lines.some(
            (line) =>
              !allowed.has(line.requirementBasisId) ||
              !allowed
                .get(line.requirementBasisId)!
                .variants.some((variant) => variant.id === line.materialVariantId),
          )
        )
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '暂存方案中的物料已不属于当前有效候选，请重新编辑后确认',
          );
        return this.repository.approve(
          dispositionId,
          {
            version: normalized.dispositionVersion,
            details: plan.lines.map((line) => ({
              originalDemandId: line.originalDemandId,
              requirementBasisId: line.requirementBasisId,
              materialVariantId: line.materialVariantId,
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
          { planId: plan.planId, version: normalized.version },
        );
      },
    });
    return execution.result;
  }

  private async availableCandidates(dispositionId: string) {
    // A scrap supplement is selected from the complete frozen batch BOM. The
    // route no longer narrows candidates by a step-specific BOM relation.
    const context = await this.repository.getCandidateContext(dispositionId);
    return context.candidates;
  }
}
