import type {
  BatchCloseoutDetail,
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  BatchCloseoutCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
export abstract class ProductionCloseoutRepository {
  abstract detail(batchId: string): Promise<BatchCloseoutDetail | null>;
  abstract begin(
    batchId: string,
    payload: BeginBatchCloseoutPayload,
    context: CommandContext,
  ): Promise<BatchCloseoutCommandResult>;
  abstract handle(
    batchId: string,
    payload: HandleBatchCloseoutItemPayload,
    context: CommandContext,
  ): Promise<BatchCloseoutCommandResult>;
}
