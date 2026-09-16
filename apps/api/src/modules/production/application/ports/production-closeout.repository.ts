import type {
  BatchCloseoutDetail,
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  SaveBatchCloseoutOutputPayload,
  SubmitBatchCloseoutPayload,
  BatchCloseoutCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { ApprovalSubjectPreparation } from '../../../approval/public.js';
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
  abstract saveOutput(
    batchId: string,
    payload: SaveBatchCloseoutOutputPayload,
    context: CommandContext,
  ): Promise<BatchCloseoutCommandResult>;
  abstract validateSubmission(
    batchId: string,
    payload: SubmitBatchCloseoutPayload,
  ): Promise<string>;
  abstract prepare(
    id: string,
    version: number,
    context: CommandContext,
  ): Promise<ApprovalSubjectPreparation>;
  abstract bind(
    id: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<number>;
  abstract lock(id: string, instance: string, version: number): Promise<void>;
  abstract finalize(
    id: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<void>;
  abstract restore(
    id: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<void>;
}
