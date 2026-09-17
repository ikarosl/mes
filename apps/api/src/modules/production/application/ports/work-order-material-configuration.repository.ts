import type {
  SaveWorkOrderMaterialConfigurationPayload,
  SaveWorkOrderMaterialConfigurationResult,
  WorkOrderMaterialConfiguration,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class WorkOrderMaterialConfigurationRepository {
  abstract get(workOrderId: string): Promise<WorkOrderMaterialConfiguration>;
  abstract save(
    workOrderId: string,
    payload: SaveWorkOrderMaterialConfigurationPayload,
    context: CommandContext,
  ): Promise<SaveWorkOrderMaterialConfigurationResult>;
}
