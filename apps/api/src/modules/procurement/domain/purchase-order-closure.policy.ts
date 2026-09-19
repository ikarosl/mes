import type { PurchaseOrderClosureReason, ReceiptQuantitySummary } from '@company/contracts';

export const allowedPurchaseOrderClosureReasons = (
  plannedQuantity: number,
  quantities: ReceiptQuantitySummary,
  hasReceipt: boolean,
): PurchaseOrderClosureReason[] => {
  const reasons: PurchaseOrderClosureReason[] = ['manual_end'];
  if (!hasReceipt) reasons.push('cancelled');
  const approved = Number(quantities.approvedQuantity);
  if (approved >= plannedQuantity) reasons.push('quality_target');
  if (
    Number(quantities.receivedQuantity) >= plannedQuantity &&
    approved < plannedQuantity &&
    Number(quantities.undeterminedQuantity) === 0 &&
    Number(quantities.pendingReturnQuantity) === 0 &&
    approved + Number(quantities.qualityReturnedQuantity) >= plannedQuantity &&
    !quantities.hasOpenReview
  )
    reasons.push('quality_return_completed');
  return reasons;
};
