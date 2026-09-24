import { MaterialVariantQuery } from '../../product/public.js';
import { Injectable } from '@nestjs/common';
import type {
  MaterialDemandManagementQuery,
  ConfigureMaterialDemandsPayload,
  AddManualMaterialDemandsPayload,
  ProductionMaterialOptionsQuery,
} from '@company/contracts';
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
    private readonly materialVariants: MaterialVariantQuery,
  ) {}

  listMaterialOptions(query: ProductionMaterialOptionsQuery) {
    return this.materialVariants.listProductionMaterials(query);
  }

  listManagement(query: MaterialDemandManagementQuery) {
    return this.repository.listManagement(query);
  }

  async configure(
    batchId: string,
    payload: ConfigureMaterialDemandsPayload,
    context: IdempotentCommandContext,
  ) {
    const normalized = {
      requirements: payload.requirements.map((requirement) => ({
        productMaterialId: requirement.productMaterialId,
        splits: requirement.splits.map((split) => ({
          materialVariantId: split.materialVariantId,
          quantity: Number(split.quantity),
          supplierHint: split.supplierHint?.trim() || null,
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
    batchId: string,
    payload: AddManualMaterialDemandsPayload,
    context: IdempotentCommandContext,
  ) {
    const reason = payload.reason.trim();
    if (!reason) throw new ProductionDomainError('INVALID_INPUT', '人工追加原因不能为空');
    const normalized = {
      productionBatchId: batchId,
      requirements: payload.requirements.map((requirement) => ({
        materialId: requirement.materialId,
        splits: requirement.splits.map((split) => ({
          materialVariantId: split.materialVariantId,
          quantity: Number(split.quantity),
          supplierHint: split.supplierHint?.trim() || null,
        })),
      })),
      reason,
    };
    const command = narrow(context);
    const execution = await this.idempotency.execute({
      scope: ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body: normalized },
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
