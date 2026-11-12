import type {
  PageQuery,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportPage,
} from '@company/contracts';

export abstract class QualityInboundQuery {
  abstract listReports(
    receiptLineId: string,
    query: PageQuery,
  ): Promise<QualityIncomingInspectionReportPage>;
  abstract getReport(reportId: string): Promise<QualityIncomingInspectionReportItem | null>;
}
