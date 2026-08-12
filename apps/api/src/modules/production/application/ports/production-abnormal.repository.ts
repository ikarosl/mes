import type {
  ApproveBatchStepReworkPayload,
  BatchStepAbnormalDispositionItem,
  CompleteReworkPayload,
  CompleteReworkResult,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionAbnormalRepository {
  abstract listReworks(batchId: string): Promise<ReworkRecordItem[]>;
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
