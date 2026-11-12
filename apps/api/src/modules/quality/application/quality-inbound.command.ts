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

/**
 * Procurement must retain the validated, non-voided source lock until the shared transaction ends.
 * This serializes first registration and revisions before Quality locks and checks the current report.
 */
export abstract class QualityInboundCommand {
  abstract recordIncomingInspectionReport(
    input: RecordIncomingInspectionReportInput,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionReportItem>;
}
