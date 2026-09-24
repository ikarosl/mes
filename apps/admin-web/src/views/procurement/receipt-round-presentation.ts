import { RECEIPT_ALLOCATION_EXECUTION_LABELS } from '@company/constants';
import type { ProcurementReceiptLine, ReceiptAllocationItem } from '@company/contracts';

export const isReceiptRejected = (line: ProcurementReceiptLine): boolean =>
  line.currentRound.triggerType === 'manual_rejection';
export const canRevokeReceiptRejection = (line: ProcurementReceiptLine): boolean =>
  isReceiptRejected(line) &&
  line.currentRound.status === 'finalized' &&
  Number(line.quantities.unprocessedQuantity) > 0;
export const canReviewReceipt = (line: ProcurementReceiptLine): boolean =>
  !isReceiptRejected(line) &&
  Number(line.quantities.unprocessedQuantity) > 0 &&
  [
    'uninspected',
    'reinspection_required',
    'quality_rejected',
    'awaiting_acceptance',
    'finalized',
  ].includes(line.currentRound.status);
export const canAcceptReceipt = (line: ProcurementReceiptLine): boolean =>
  !isReceiptRejected(line) &&
  Number(line.quantities.unprocessedQuantity) > 0 &&
  ['awaiting_acceptance', 'finalized'].includes(line.currentRound.status) &&
  !!line.currentRound.inspectionId;
export const canRejectReceipt = (line: ProcurementReceiptLine): boolean =>
  !isReceiptRejected(line) && Number(line.quantities.unprocessedQuantity) > 0;
export const currentReceiptCase = (line: ProcurementReceiptLine) =>
  line.cases.find(
    (record) => record.roundId === line.currentRound.id && record.status === 'reviewing',
  );

export const canExecuteReceiptAllocation = (
  line: ProcurementReceiptLine,
  allocation: ReceiptAllocationItem,
): boolean =>
  allocation.isCurrent &&
  allocation.roundId === line.currentRound.id &&
  line.currentRound.status === 'finalized' &&
  Number(allocation.remainingQuantity) > 0 &&
  (allocation.disposition === 'return' ||
    (allocation.disposition === 'inbound' &&
      !allocation.terminationReason &&
      !isReceiptRejected(line)));

export const receiptAllocationExecutionLabel = (
  line: ProcurementReceiptLine,
  allocation: ReceiptAllocationItem,
): string => {
  const labels = RECEIPT_ALLOCATION_EXECUTION_LABELS;
  // 已完成物流事实不会因后续整批轮次失效而变回待办。
  if (
    allocation.disposition === 'inbound' &&
    Number(allocation.inboundQuantity) >= Number(allocation.quantity)
  )
    return labels.inbound_completed;
  if (
    allocation.disposition === 'return' &&
    Number(allocation.returnedQuantity) >= Number(allocation.quantity)
  )
    return labels.return_completed;
  if (!allocation.isCurrent || allocation.roundId !== line.currentRound.id)
    return labels.superseded;
  if (line.currentRound.status !== 'finalized') return labels.blocked;
  if (allocation.disposition === 'pending') return labels.pending;
  if (!canExecuteReceiptAllocation(line, allocation)) return labels.blocked;
  if (allocation.disposition === 'inbound')
    return Number(allocation.inboundQuantity) > 0
      ? labels.partially_inbound
      : labels.pending_inbound;
  return Number(allocation.returnedQuantity) > 0
    ? labels.partially_returned
    : labels.pending_return;
};
