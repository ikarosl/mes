import type { PageQuery, PageResult, ProcessInspectionEntry } from '@company/contracts';
import type { ProcessInspectionSource } from './quality-process-inspection.command.js';

/** 供产线按已核验的任务工序读取检查依据，不授予承接写入资格。 */
export abstract class QualityProcessInspectionQuery {
  abstract listPendingForStep(
    source: ProcessInspectionSource,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionEntry>>;
  abstract getForStep(
    source: ProcessInspectionSource,
    inspectionId: string,
  ): Promise<ProcessInspectionEntry | null>;
}
