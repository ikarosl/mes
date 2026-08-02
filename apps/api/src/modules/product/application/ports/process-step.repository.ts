import type {
  ProcessStepListItem,
  ProcessStepOption,
  ProcessStepPayload,
  ProcessStepQuery,
  PageResult,
} from '@company/contracts';
import type { AuditContext } from '../../../../common/audit/audit.types.js';
import type { StoredTechnicalFile } from './technical-file.repository.js';

export abstract class ProcessStepRepository {
  abstract listProcessSteps(query: ProcessStepQuery): Promise<PageResult<ProcessStepListItem>>;
  abstract listProcessStepOptions(): Promise<ProcessStepOption[]>;
  abstract createProcessStep(
    payload: ProcessStepPayload,
    audit: AuditContext,
  ): Promise<{ id: string }>;
  abstract updateProcessStep(
    id: string,
    payload: ProcessStepPayload,
    audit: AuditContext,
  ): Promise<void>;
  abstract setProcessStepStatus(id: string, status: number, audit: AuditContext): Promise<void>;
  abstract attachProcessStepSop(
    id: string,
    file: StoredTechnicalFile,
    audit: AuditContext,
  ): Promise<void>;
  abstract setProcessStepDefaultSop(
    id: string,
    fileId: string | null,
    audit: AuditContext,
  ): Promise<void>;
}
