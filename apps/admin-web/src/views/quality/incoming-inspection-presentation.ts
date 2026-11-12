import type {
  QualityIncomingInspectionLineItem,
  QualityIncomingInspectionReportSummary,
} from '@company/contracts';

type ReportIdentity = Pick<QualityIncomingInspectionReportSummary, 'id'>;

export function inspectionRecordStatusLabel(
  record: ReportIdentity,
  currentReportId: string | null,
): string {
  return record.id === currentReportId ? '当前' : '历史';
}

export function inspectionRecordTagType(
  record: ReportIdentity,
  currentReportId: string | null,
): 'primary' | 'info' {
  return record.id === currentReportId ? 'primary' : 'info';
}

export function inspectionReportActionLabel(
  line: Pick<QualityIncomingInspectionLineItem, 'void' | 'latestReport'>,
): string {
  if (line.void) return '查看报告历史';
  return line.latestReport ? '查看报告' : '填写报告';
}
