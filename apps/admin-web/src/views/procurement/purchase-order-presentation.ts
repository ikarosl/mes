import type {
  PurchaseOrderLineStatus,
  PurchaseOrderStatus,
  PurchaseOrderSupplementReason,
} from '@company/contracts';

interface PurchaseOrderStatusTagAppearance {
  type: 'primary' | 'success' | 'danger' | 'info';
  effect: 'light';
}

interface PurchaseOrderSupplementReasonTagAppearance {
  type: 'primary' | 'warning';
  effect: 'light';
}

const PURCHASE_ORDER_SUPPLEMENT_REASON_TAGS: Record<
  PurchaseOrderSupplementReason,
  PurchaseOrderSupplementReasonTagAppearance
> = {
  quality_replacement: { type: 'warning', effect: 'light' },
  excess_purchase: { type: 'primary', effect: 'light' },
};

// 已结束只表示采购跟进结束，不代表到货、检验、入库或退回完成。
const PURCHASE_ORDER_STATUS_TAGS: Record<PurchaseOrderStatus, PurchaseOrderStatusTagAppearance> = {
  draft: { type: 'info', effect: 'light' },
  ordered: { type: 'primary', effect: 'light' },
  completed: { type: 'success', effect: 'light' },
  cancelled: { type: 'danger', effect: 'light' },
};
const PURCHASE_ORDER_LINE_STATUS_TAGS: Record<
  PurchaseOrderLineStatus,
  PurchaseOrderStatusTagAppearance
> = {
  draft: PURCHASE_ORDER_STATUS_TAGS.draft,
  open: PURCHASE_ORDER_STATUS_TAGS.ordered,
  closed: PURCHASE_ORDER_STATUS_TAGS.completed,
  cancelled: PURCHASE_ORDER_STATUS_TAGS.cancelled,
};

export const purchaseOrderStatusTag = (
  status: PurchaseOrderStatus,
): PurchaseOrderStatusTagAppearance => PURCHASE_ORDER_STATUS_TAGS[status];
export const purchaseOrderLineStatusTag = (
  status: PurchaseOrderLineStatus,
): PurchaseOrderStatusTagAppearance => PURCHASE_ORDER_LINE_STATUS_TAGS[status];
export const purchaseOrderSupplementReasonTag = (
  reason: PurchaseOrderSupplementReason,
): PurchaseOrderSupplementReasonTagAppearance => PURCHASE_ORDER_SUPPLEMENT_REASON_TAGS[reason];
