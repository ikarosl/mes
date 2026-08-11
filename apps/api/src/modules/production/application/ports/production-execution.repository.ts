import type { ProductionStepCommandResult, ProductionWorkerTaskItem } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionExecutionRepository {
  abstract listWorkerTasks(actorId: string): Promise<ProductionWorkerTaskItem[]>;
  abstract assignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionStepCommandResult>;
  abstract unassignStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionStepCommandResult>;
  abstract reassignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionStepCommandResult>;
  abstract startStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext & { actorId: string },
  ): Promise<ProductionStepCommandResult>;
}
