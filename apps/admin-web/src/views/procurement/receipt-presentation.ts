import type { ProcurementReceiptLineOverview } from '@company/contracts';
export type ReceiptDetailIntent = 'handling' | 'void';
export const isReceiptVoided = (
  line: Pick<ProcurementReceiptLineOverview, 'void' | 'stage'>,
): boolean => Boolean(line.void) || line.stage === 'voided';
