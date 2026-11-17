import type {
  StockDocumentLine,
  StockDocumentOrder,
  StockDocumentStatus,
} from '@company/contracts';
import {
  STOCK_DOCUMENT_DIRECTION_LABELS,
  STOCK_DOCUMENT_SOURCE_LABELS,
  STOCK_DOCUMENT_STATUS_LABELS,
} from '@company/constants';
import { formatQuantity } from '../../utils/quantity';
import { formatDateTimeForDisplay } from '../../utils/date';

export function stockDocumentStatusTag(
  status: StockDocumentStatus,
): 'success' | 'warning' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'info';
  return 'warning';
}
export function stockDocumentQuantitySummary(order: StockDocumentOrder): string {
  return (
    order.quantitySummary
      .map((entry) => `${formatQuantity(entry.quantity)} ${entry.unit}`)
      .join('；') || '—'
  );
}
export function stockDocumentObjectSummary(order: StockDocumentOrder): string {
  return (
    [
      ...new Set(
        order.details
          .filter((line) => !line.isDeleted)
          .map((line) =>
            [line.itemCode, line.itemName, line.materialVariantCode].filter(Boolean).join(' · '),
          ),
      ),
    ].join('；') || '—'
  );
}
export function stockDocumentSourceSummary(order: StockDocumentOrder): string {
  if (order.reason) return order.reason;
  const references = [...order.sources.procurementReceipts, ...order.sources.productionBatches];
  return references.map((entry) => entry.orderNo).join('；') || '—';
}
function stockDocumentLineSource(line: StockDocumentLine): string {
  if (line.procurementSource) {
    const source = line.procurementSource;
    return `${source.purchaseOrder.purchaseOrderNo} / ${source.receipt.receiptNo} / ${source.supplierName || '未记录供应商'}`;
  }
  if (line.productionSource) {
    const source = line.productionSource;
    return [source.workOrderNo, source.batchNo, source.trackingCardNo].filter(Boolean).join(' / ');
  }
  return '—';
}
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
      character,
  );

export function printStockDocument(order: StockDocumentOrder): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.dataset.printFrame = 'stock-document';
  Object.assign(frame.style, {
    position: 'fixed',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(frame);
  const target = frame.contentWindow;
  if (!target) {
    frame.remove();
    throw new Error('打印初始化失败');
  }
  const timer = window.setTimeout(() => frame.remove(), 60_000);
  const cleanup = (): void => {
    window.clearTimeout(timer);
    frame.remove();
  };
  target.addEventListener('afterprint', cleanup, { once: true });
  const direction = STOCK_DOCUMENT_DIRECTION_LABELS[order.direction];
  const status = STOCK_DOCUMENT_STATUS_LABELS[order.status];
  const title = `${STOCK_DOCUMENT_SOURCE_LABELS[order.sourceType]}${order.sourceType === 'other' ? direction : ''}单`;
  const lines = order.details.filter((line) => !line.isDeleted);
  target.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(order.orderNo)}</title><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#111;padding:24px}h1{text-align:center;font-size:24px}.status{text-align:center;font-size:18px;margin-bottom:20px}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:16px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:8px;text-align:left}th{background:#f4f4f5}.signatures{display:flex;justify-content:space-between;margin-top:60px}@media print{body{padding:0}}</style></head><body><h1>${escapeHtml(title)}</h1><div class="status">${escapeHtml(order.status === 'cancelled' ? '已取消，不得作为有效库存凭证' : status)}</div><div class="meta"><span>单号：${escapeHtml(order.orderNo)}</span><span>本单数量：${escapeHtml(stockDocumentQuantitySummary(order))}</span><span>制单人：${escapeHtml(order.createdByName || '—')}</span><span>制单时间：${escapeHtml(formatDateTimeForDisplay(order.createdAt))}</span><span>确认人：${escapeHtml(order.operatorName || '—')}</span><span>确认时间：${escapeHtml(formatDateTimeForDisplay(order.confirmedAt))}</span></div><table><thead><tr><th>行号</th><th>物料 / 成品</th><th>精确版本</th><th>库存批次</th><th>数量</th><th>来源</th></tr></thead><tbody>${lines.map((line) => `<tr><td>${line.lineNo}</td><td>${escapeHtml(`${line.itemCode} · ${line.itemName}`)}</td><td>${escapeHtml(line.materialVariantCode || '—')}</td><td>${escapeHtml(line.batchCode || '待确认生成')}</td><td>${escapeHtml(`${formatQuantity(line.quantity)} ${line.unit}`)}</td><td>${escapeHtml(stockDocumentLineSource(line))}</td></tr>`).join('')}</tbody></table><p>办理原因：${escapeHtml(order.reason || '—')}</p><p>备注：${escapeHtml(order.remark || '—')}</p>${order.cancelReason ? `<p>取消原因：${escapeHtml(order.cancelReason)}</p>` : ''}<div class="signatures"><span>${direction}经办人：____________</span><span>交接人：____________</span><span>日期：____________</span></div></body></html>`,
  );
  target.document.close();
  target.focus();
  target.print();
}
