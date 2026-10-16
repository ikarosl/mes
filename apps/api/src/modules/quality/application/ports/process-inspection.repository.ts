import type {
  CreateProcessInspectionPayload,
  CorrectProcessInspectionPayload,
  ReverseProcessInspectionPayload,
  PageQuery,
  PageResult,
  ProcessInspectionEntry,
  ProcessInspectionRecord,
  ProcessInspectionQuery,
  ProcessInspectionStepSummary,
  ProcessInspectionCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { ProcessInspectionSource } from '../quality-process-inspection.command.js';
export abstract class ProcessInspectionRepository {
  abstract list(query: ProcessInspectionQuery): Promise<PageResult<ProcessInspectionStepSummary>>;
  abstract step(stepId: string): Promise<ProcessInspectionStepSummary | null>;
  abstract entries(stepId: string, query: PageQuery): Promise<PageResult<ProcessInspectionEntry>>;
  abstract detail(inspectionId: string): Promise<ProcessInspectionEntry | null>;
  abstract pendingForStep(
    source: ProcessInspectionSource,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionEntry>>;
  abstract detailForStep(
    source: ProcessInspectionSource,
    inspectionId: string,
  ): Promise<ProcessInspectionEntry | null>;
  abstract records(
    inspectionId: string,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionRecord>>;
  abstract create(
    payload: CreateProcessInspectionPayload,
    context: CommandContext,
  ): Promise<ProcessInspectionCommandResult>;
  abstract correct(
    inspectionId: string,
    payload: CorrectProcessInspectionPayload,
    context: CommandContext,
  ): Promise<ProcessInspectionCommandResult>;
  abstract reverse(
    inspectionId: string,
    payload: ReverseProcessInspectionPayload,
    context: CommandContext,
  ): Promise<ProcessInspectionCommandResult>;
}
