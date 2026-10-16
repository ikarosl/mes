import type {
  AcceptProcessInspectionPayload,
  ApproveBatchStepReworkPayload,
  BatchStepAbnormalDispositionItem,
  CompleteReworkPayload,
  CompleteReworkResult,
  PageQuery,
  PageResult,
  ProcessInspectionDispositionHistoryItem,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
  ReworkRecordView,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionAbnormalRepository {
  abstract requireInspectionStep(batchId: string, stepId: string): Promise<void>;
  abstract listInspectionDispositions(
    batchId: string,
    stepId: string,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionDispositionHistoryItem>>;
  abstract acceptInspection(
    batchId: string,
    stepId: string,
    payload: AcceptProcessInspectionPayload,
    context: CommandContext,
  ): Promise<BatchStepAbnormalDispositionItem>;
  abstract listReworks(batchId: string): Promise<ReworkRecordView[]>;
  abstract approveRework(
    dispositionId: string,
    payload: ApproveBatchStepReworkPayload,
    context: CommandContext,
  ): Promise<ReworkRecordItem>;
  abstract rejectDisposition(
    dispositionId: string,
    payload: RejectBatchStepAbnormalDispositionPayload,
    context: CommandContext,
  ): Promise<BatchStepAbnormalDispositionItem>;
  abstract startRework(
    reworkId: string,
    version: number,
    context: CommandContext,
  ): Promise<ReworkRecordItem>;
  abstract completeRework(
    reworkId: string,
    payload: CompleteReworkPayload,
    context: CommandContext,
  ): Promise<CompleteReworkResult>;
}
