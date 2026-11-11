import type { JsonTableColumn, QualityIncomingInspectionReportItem } from '@company/contracts';
import {
  QUALITY_INCOMING_INSPECTION_REPORT_SIGNATURE_LABELS,
  QUALITY_INCOMING_INSPECTION_REPORT_TITLE,
  QUALITY_INSPECTION_METHOD_LABELS,
} from '@company/constants';
import { formatDateTimeForDisplay } from '../../utils/date';

const escapeHtml = (value: string | null | undefined): string =>
  (value ?? '').replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[character] ?? character;
  });

/** Printing uses the saved header and cells; current master data and unsigned users are never substituted. */
export function incomingInspectionReportHtml(report: QualityIncomingInspectionReportItem): string {
  const headers: Array<[string, string | null]> = [
    ['检验日期', formatDateTimeForDisplay(report.inspectedAt)],
    ['材料名称', report.itemName],
    ['规格型号', report.specification],
    ['供应商', report.supplierName],
    ['采购单号', report.purchaseNo],
    ['来料批次号', report.batchNo],
    ['有效期', report.expiresOn],
  ];
  const { columns, rows } = report.inspectionDetails;
  const columnGroups: JsonTableColumn[][] = [];
  const firstColumn = columns[0];
  if (columns.length <= 6) columnGroups.push(columns);
  else if (firstColumn) {
    // 宽表分栏保留首列和真实行序，避免将全部列压缩到一张纸上。
    for (let offset = 1; offset < columns.length; offset += 5)
      columnGroups.push([firstColumn, ...columns.slice(offset, offset + 5)]);
  }
  const tables = columnGroups
    .map((group, index) => {
      const heading = `${report.reportNo} · 检查记录${columnGroups.length > 1 ? `（分栏 ${index + 1}/${columnGroups.length}）` : ''}`;
      return `<section class="record-block"><table><colgroup><col class="row-number">${group.map(() => '<col>').join('')}</colgroup><thead><tr><th colspan="${group.length + 1}" class="record-heading">${escapeHtml(heading)}</th></tr><tr><th scope="col">序号</th>${group.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr><td class="row-index">${rowIndex + 1}</td>${group.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
    })
    .join('');
  const notes: Array<[string, string | null]> = [
    ['异常说明', report.remark],
    ['检查凭据', report.evidence],
    ['更正原因', report.correctionReason],
  ];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(report.reportNo)} · ${escapeHtml(QUALITY_INCOMING_INSPECTION_REPORT_TITLE)}</title><style>
    @page{size:A4 ${columns.length > 5 ? 'landscape' : 'portrait'};margin:15mm}
    *{box-sizing:border-box}body{margin:0;font:13px/1.6 "Microsoft YaHei","Noto Sans SC",Arial,sans-serif;color:#111}
    h1{text-align:center;font-size:25px;letter-spacing:3px;margin:0 0 12px}.report-no{text-align:right;margin-bottom:12px;font-size:12px}
    .headers{display:grid;grid-template-columns:1fr 1fr;border:1px solid #222;border-bottom:0}.field{display:flex;min-height:37px;border-bottom:1px solid #222;padding:6px 9px;gap:10px}.field:nth-child(odd){border-right:1px solid #222}.field:last-child{grid-column:1/-1;border-right:0}.label{white-space:nowrap;font-weight:600;min-width:70px}.value{overflow-wrap:anywhere;white-space:pre-wrap}.summary{margin:12px 0}
    table{border-collapse:collapse;width:100%;table-layout:fixed}.row-number{width:38px}th,td{border:1px solid #222;padding:8px 6px;white-space:pre-wrap;overflow-wrap:anywhere;vertical-align:top}th{font-weight:600;text-align:center}.row-index{text-align:center}.record-heading{text-align:left;font-size:12px;background:#f5f5f5}thead{display:table-header-group}tr{break-inside:avoid}.record-block+.record-block{break-before:page}.remark{margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}
    .signatures{display:flex;justify-content:space-between;gap:20px;margin-top:35px;break-inside:avoid}.signature{flex:1;display:flex;gap:8px}.line{flex:1;border-bottom:1px solid #222;min-height:25px}
    </style></head><body><h1>${escapeHtml(QUALITY_INCOMING_INSPECTION_REPORT_TITLE)}</h1><div class="report-no">报告编号：${escapeHtml(report.reportNo)}</div><div class="headers">${headers.map(([label, value]) => `<div class="field"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value || '—')}</span></div>`).join('')}</div>
    <div class="summary">检验方式：${escapeHtml(QUALITY_INSPECTION_METHOD_LABELS[report.inspectionMethod])}&emsp;检查数量：${escapeHtml(report.inspectedQuantity)} ${escapeHtml(report.unit)}&emsp;合格：${escapeHtml(report.qualifiedQuantity)}&emsp;不合格：${escapeHtml(report.unqualifiedQuantity)}</div>
    ${tables}${notes
      .filter(([, value]) => value)
      .map(
        ([label, value]) => `<div class="remark">${escapeHtml(label)}：${escapeHtml(value)}</div>`,
      )
      .join('')}
    <div class="signatures">${QUALITY_INCOMING_INSPECTION_REPORT_SIGNATURE_LABELS.map((label) => `<div class="signature"><span>${escapeHtml(label)}：</span><span class="line"></span></div>`).join('')}</div></body></html>`;
}

export function printIncomingInspectionReport(report: QualityIncomingInspectionReportItem): void {
  const frame = document.createElement('iframe');
  frame.title = QUALITY_INCOMING_INSPECTION_REPORT_TITLE;
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;';
  frame.onload = async () => {
    await frame.contentDocument?.fonts.ready;
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      frame.remove();
      return;
    }
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  };
  frame.srcdoc = incomingInspectionReportHtml(report);
  document.body.append(frame);
}
