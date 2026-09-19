import { Injectable } from '@nestjs/common';
import type {
  SaveWorkOrderMaterialConfigurationPayload,
  SaveWorkOrderMaterialConfigurationResult,
  WorkOrderMaterialConfiguration,
} from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { SAVE_WORK_ORDER_MATERIAL_CONFIGURATION_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
import { workOrderMaterialConfigurationResultCodec } from './idempotency/work-order-material-configuration-result.codec.js';
import { WorkOrderMaterialConfigurationRepository } from './ports/work-order-material-configuration.repository.js';

@Injectable()
export class WorkOrderMaterialConfigurationService {
  constructor(
    private readonly repository: WorkOrderMaterialConfigurationRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  get(workOrderId: string): Promise<WorkOrderMaterialConfiguration> {
    return this.repository.get(workOrderId);
  }

  async save(
    workOrderId: string,
    payload: SaveWorkOrderMaterialConfigurationPayload,
    context: IdempotentCommandContext,
  ): Promise<SaveWorkOrderMaterialConfigurationResult> {
    const body = {
      version: payload.version,
      reason: payload.reason.trim(),
      selections: payload.selections.map((line) => ({
        materialId: line.materialId,
        materialVariantId: line.materialVariantId,
      })),
    };
    const execution = await this.idempotency.execute({
      scope: SAVE_WORK_ORDER_MATERIAL_CONFIGURATION_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { workOrderId }, body },
      resultCodec: workOrderMaterialConfigurationResultCodec,
      handler: () =>
        this.repository.save(workOrderId, body, {
          actorId: context.actorId,
          requestId: context.requestId,
          ip: context.ip,
          userAgent: context.userAgent,
        }),
    });
    return execution.result;
  }
}
