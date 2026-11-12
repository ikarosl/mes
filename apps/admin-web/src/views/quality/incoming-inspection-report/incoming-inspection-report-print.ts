import { h } from 'vue';
import type { QualityIncomingInspectionReportItem } from '@company/contracts';
import { QUALITY_INCOMING_INSPECTION_REPORT_TITLE } from '@company/constants';
import { printVueComponent } from '../../../composables/printing/print-vue-component';
import IncomingInspectionReport from './IncomingInspectionReport.vue';
import incomingInspectionReportStyles from './incoming-inspection-report.css?inline';

export async function printIncomingInspectionReport(
  report: QualityIncomingInspectionReportItem,
): Promise<void> {
  const isLandscape = report.inspectionDetails.columns.length > 5;
  return printVueComponent({
    title: `${report.reportNo} · ${QUALITY_INCOMING_INSPECTION_REPORT_TITLE}`,
    styles: `${incomingInspectionReportStyles}\n@page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; }`,
    render: () => h(IncomingInspectionReport, { report }),
    bodyClassName: isLandscape ? 'landscape' : undefined,
  });
}
