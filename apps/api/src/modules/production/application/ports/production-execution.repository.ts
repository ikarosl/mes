import type {
  ProductionExecutionCompletionCheck,
  ProductionExecutionCompletionResult,
  ProductionStepCommandResult,
  ProductionWorkerTaskItem,
  ProductionExecutionStartCheck,
  ProductionExecutionStartResult,
  StartProductionExecutionPayload,
  CompleteProductionExecutionPayload,
  PageResult,
  ProductionStepExecutionHistoryItem,
  ReopenProductionStepPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export interface ProductionStepSopSnapshot {
  fileId: string;
  fileName: string;
  versionNo: string;
  objectKey: string;
}

export abstract class ProductionExecutionRepository {
  abstract getStartCheck(batchId: string): Promise<ProductionExecutionStartCheck>;
  abstract startExecution(
    batchId: string,
    payload: StartProductionExecutionPayload,
    context: CommandContext,
  ): Promise<ProductionExecutionStartResult>;
  abstract completeResearchExecution(
    batchId: string,
    payload: CompleteProductionExecutionPayload,
    context: CommandContext,
  ): Promise<ProductionExecutionCompletionResult>;
  abstract getCompletionCheck(batchId: string): Promise<ProductionExecutionCompletionCheck>;
  abstract completeExecution(
    batchId: string,
    payload: CompleteProductionExecutionPayload,
    context: CommandContext,
  ): Promise<ProductionExecutionCompletionResult>;
  abstract listWorkerTasks(
    actorId: string,
    query: { page: number; pageSize: number },
  ): Promise<PageResult<ProductionWorkerTaskItem>>;
  abstract getStepSopSnapshot(
    batchId: string,
    stepRecordId: string,
    responsibleUserId?: string,
  ): Promise<ProductionStepSopSnapshot>;
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
    asAdministrator?: boolean,
  ): Promise<ProductionStepCommandResult>;
  abstract completeStep(
    batchId: string,
    stepRecordId: string,
    version: number,
    context: CommandContext & { actorId: string },
    asAdministrator?: boolean,
  ): Promise<ProductionStepCommandResult>;
  abstract reopenStep(
    batchId: string,
    stepRecordId: string,
    payload: ReopenProductionStepPayload,
    context: CommandContext & { actorId: string },
    asAdministrator?: boolean,
  ): Promise<ProductionStepCommandResult>;
  abstract listStepExecutionHistory(
    batchId: string,
    stepRecordId: string,
    query: { page: number; pageSize: number },
    responsibleUserId?: string,
  ): Promise<PageResult<ProductionStepExecutionHistoryItem>>;
}
