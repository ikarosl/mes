import type { CommandContext } from '../../../common/audit/audit.types.js';
export interface ProcessInspectionSource {
  batchId: string;
  stepId: string;
}
export interface AcceptProcessInspectionInput extends ProcessInspectionSource {
  inspectionId: string;
  recordId: string;
  version: number;
  quantity: number;
}
export interface AcceptedProcessInspection extends ProcessInspectionSource {
  inspectionId: string;
  recordId: string;
  acceptedQuantity: number;
  version: number;
}
/** Production 先锁工单、任务和工序，再在同池活动事务内承接；明细与累计一起提交。 */
export abstract class QualityProcessInspectionCommand {
  abstract getSource(inspectionId: string): Promise<ProcessInspectionSource | null>;
  abstract accept(
    input: AcceptProcessInspectionInput,
    context: CommandContext,
  ): Promise<AcceptedProcessInspection>;
}
