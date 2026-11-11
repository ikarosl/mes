import type { ProcurementReceiptLineOverview } from '@company/contracts';
import { RECEIPT_LINE_STAGE_LABELS } from '@company/constants';
export type ReceiptDetailIntent = 'handling' | 'void';
export const isReceiptVoided = (
  line: Pick<ProcurementReceiptLineOverview, 'void' | 'stage'>,
): boolean => Boolean(line.void) || line.stage === 'voided';
export const receiptLineStageLabel = (
  line: Pick<ProcurementReceiptLineOverview, 'stage'>,
): string => RECEIPT_LINE_STAGE_LABELS[line.stage];
export const receiptLineStageType = (
  line: Pick<ProcurementReceiptLineOverview, 'stage'>,
): 'info' | 'primary' | 'danger' => {
  if (line.stage === 'voided') return 'danger';
  return line.stage === 'handled' ? 'primary' : 'info';
};
