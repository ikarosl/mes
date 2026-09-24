import type {
  FinishedInspectionCommandResult,
  FinishedInspectionTaskDetail,
  FinishedInspectionTaskQuery,
  FinishedInspectionTaskItem,
  ProductionOutputInspectionFacts,
  PageQuery,
  PageResult,
  ProductionOutputInspection,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
export interface RecordFinishedInspectionInput extends ProductionOutputInspectionFacts {
  version: number;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
}
export abstract class FinishedInspectionRepository {
  abstract listTasks(
    query: FinishedInspectionTaskQuery,
  ): Promise<PageResult<FinishedInspectionTaskItem>>;
  abstract detail(batchId: string): Promise<FinishedInspectionTaskDetail | null>;
  abstract listRecords(
    batchId: string,
    query: PageQuery,
  ): Promise<PageResult<ProductionOutputInspection>>;
  abstract record(
    batchId: string,
    payload: RecordFinishedInspectionInput,
    context: CommandContext,
  ): Promise<FinishedInspectionCommandResult>;
}
