import type {
  BatchCloseoutDetail,
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  BatchCloseoutCommandResult,
  BatchCloseoutWithdrawalCheck,
  WithdrawBatchCloseoutPayload,
  WithdrawBatchCloseoutResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
export abstract class ProductionCloseoutRepository {
  abstract detail(batchId: string): Promise<BatchCloseoutDetail | null>;
  abstract withdrawalCheck(batchId: string): Promise<BatchCloseoutWithdrawalCheck>;
  abstract withdraw(
    batchId: string,
    payload: WithdrawBatchCloseoutPayload,
    context: CommandContext,
  ): Promise<WithdrawBatchCloseoutResult>;
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
