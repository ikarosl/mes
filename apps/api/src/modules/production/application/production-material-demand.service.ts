import { Injectable } from '@nestjs/common';
import type { MaterialDemandManagementQuery } from '@company/contracts';
import type {
  IdempotentCommandContext,
  CommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import {
  ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
  CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import {
  addManualMaterialDemandResultCodec,
  configureMaterialDemandsResultCodec,
} from './idempotency/production-material-demand-configuration-result.codec.js';
import { ProductionMaterialDemandConfigurationRepository } from './ports/production-material-demand-configuration.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';

@Injectable()
export class ProductionMaterialDemandService {
  constructor(
    private readonly repository: ProductionMaterialDemandConfigurationRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  listManagement(query: MaterialDemandManagementQuery) {
    return this.repository.listManagement(query);
  }

  async configure(
    batchId: string,
    payload: {
      requirements: Array<{
        productMaterialId: string;
        splits: Array<{ materialVariantId: string; quantity: number }>;
      }>;
    },
    context: IdempotentCommandContext,
  ) {
    const normalized = {
      requirements: payload.requirements.map((requirement) => ({
        productMaterialId: requirement.productMaterialId,
        splits: requirement.splits.map((split) => ({
          materialVariantId: split.materialVariantId,
          quantity: Number(split.quantity),
        })),
      })),
    };
    const command = narrow(context);
    const execution = await this.idempotency.execute({
      scope: CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: normalized },
      resultCodec: configureMaterialDemandsResultCodec,
      handler: async () => {
        await this.repository.configureNormalDemands(batchId, normalized.requirements, command);
        return { configured: true as const };
      },
    });
    return execution.result;
  }

  async addManual(
    demandId: string,
    payload: { materialVariantId: string; quantity: number; reason: string },
    context: IdempotentCommandContext,
  ) {
    const reason = payload.reason.trim();
    if (!reason) throw new ProductionDomainError('INVALID_INPUT', '人工补充原因不能为空');
    const normalized = {
      parentDemandId: demandId,
      materialVariantId: payload.materialVariantId,
      quantity: Number(payload.quantity),
      reason,
    };
    const command = narrow(context);
    const execution = await this.idempotency.execute({
      scope: ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { demandId }, body: normalized },
      resultCodec: addManualMaterialDemandResultCodec,
      handler: () => this.repository.addManualDemand(normalized, command),
    });
    return execution.result;
  }
}

const narrow = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
