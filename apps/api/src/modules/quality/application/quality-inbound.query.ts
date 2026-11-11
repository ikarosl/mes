import type {
  PageQuery,
  PageResult,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportSummary,
} from '@company/contracts';

export abstract class QualityInboundQuery {
  abstract listReports(
    receiptLineId: string,
    query: PageQuery,
  ): Promise<PageResult<QualityIncomingInspectionReportSummary>>;
  abstract getReport(reportId: string): Promise<QualityIncomingInspectionReportItem | null>;
}
