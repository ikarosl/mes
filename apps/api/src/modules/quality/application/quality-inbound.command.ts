import type {
  QualityIncomingInspectionReportInput,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportSource,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';

export interface RecordIncomingInspectionReportInput {
  source: QualityIncomingInspectionReportSource;
  report: QualityIncomingInspectionReportInput;
}

/** Procurement first locks and validates the non-voided source; a shared active transaction is required. */
export abstract class QualityInboundCommand {
  abstract recordIncomingInspectionReport(
    input: RecordIncomingInspectionReportInput,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionReportItem>;
}
