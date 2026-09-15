import type {
  BatchTerminationCheck,
  TerminateProductionBatchPayload,
  TerminateProductionBatchResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionTerminationRepository {
  abstract getCheck(batchId: string): Promise<BatchTerminationCheck>;
  abstract terminate(
    batchId: string,
    payload: TerminateProductionBatchPayload,
    context: CommandContext,
  ): Promise<TerminateProductionBatchResult>;
}
