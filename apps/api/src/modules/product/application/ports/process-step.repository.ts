import type {
  ProcessStepListItem,
  ProcessStepOption,
  ProcessStepPayload,
  ProcessStepQuery,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProcessStepRepository {
  abstract listProcessSteps(query: ProcessStepQuery): Promise<PageResult<ProcessStepListItem>>;
  abstract listProcessStepOptions(): Promise<ProcessStepOption[]>;
  abstract createProcessStep(
    payload: ProcessStepPayload,
    audit: CommandContext,
  ): Promise<{ id: string }>;
  abstract updateProcessStep(
    id: string,
    payload: ProcessStepPayload,
    audit: CommandContext,
  ): Promise<void>;
  abstract setProcessStepStatus(id: string, status: number, audit: CommandContext): Promise<void>;
  abstract attachProcessStepSop(id: string, fileId: string, audit: CommandContext): Promise<void>;
  abstract setProcessStepDefaultSop(
    id: string,
    fileId: string | null,
    audit: CommandContext,
  ): Promise<void>;
}
