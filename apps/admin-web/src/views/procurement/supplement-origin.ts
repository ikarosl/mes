import type { PurchaseOrderDetail } from '@company/contracts';

export interface ExcessSupplementOrigin {
  orderId: string;
  purchaseNo: string;
}

/** 全部冻结原行必须指向同一主单；缺失或冲突时不可选择一个来源代替。 */
export const excessSupplementOrigin = (
  order: PurchaseOrderDetail | null,
): ExcessSupplementOrigin | null => {
  if (order?.supplementReason !== 'excess_purchase' || !order.items.length) return null;
  const first = order.items[0];
  if (
    !first?.originPurchaseOrderId ||
    first.originPurchaseOrderId === order.id ||
    !first.originPurchaseNo ||
    !first.originOrderLineId
  )
    return null;
  const valid = order.items.every(
    (line) =>
      line.originPurchaseOrderId === first.originPurchaseOrderId &&
      line.originPurchaseNo === first.originPurchaseNo &&
      Boolean(line.originOrderLineId),
  );
  return valid
    ? { orderId: first.originPurchaseOrderId, purchaseNo: first.originPurchaseNo }
    : null;
};
