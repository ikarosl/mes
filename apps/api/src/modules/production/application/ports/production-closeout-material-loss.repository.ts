import type {
  RecordCloseoutMaterialLossPayload,
  RecordCloseoutMaterialLossResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductionCloseoutMaterialLossRepository {
  abstract record(
    batchId: string,
    payload: RecordCloseoutMaterialLossPayload,
    context: CommandContext,
  ): Promise<RecordCloseoutMaterialLossResult>;
}
