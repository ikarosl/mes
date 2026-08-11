import type {
  BatchStepReportCommandResult,
  CorrectBatchStepReportCommandResult,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  ProductionExecutionRecordGroup,
  ReverseBatchStepReportPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionReportingRepository {
  abstract getBatchExecution(batchId: string): Promise<ProductionExecutionRecordGroup>;
  abstract createReport(
    batchId: string,
    stepRecordId: string,
    payload: CreateBatchStepReportPayload,
    context: CommandContext & { actorId: string },
  ): Promise<BatchStepReportCommandResult>;
  abstract reverseReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: ReverseBatchStepReportPayload,
    context: CommandContext,
  ): Promise<BatchStepReportCommandResult>;
  abstract correctReport(
    batchId: string,
    stepRecordId: string,
    reportId: string,
    payload: CorrectBatchStepReportPayload,
    context: CommandContext,
  ): Promise<CorrectBatchStepReportCommandResult>;
}
