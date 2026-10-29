import type {
  InventoryBatchStatus,
  InventoryReferenceType,
  InventorySourceType,
  InventoryTransactionType,
  ReturnOrderStatus,
  ScrapStatus,
  StockCheckResult,
  StockCheckStatus,
  StockStatus,
} from '@company/contracts';
import {
  INVENTORY_REFERENCE_TYPE_LABELS,
  INVENTORY_SOURCE_TYPE_LABELS,
  INVENTORY_TRANSACTION_TYPE_LABELS,
  RETURN_ORDER_STATUS_LABELS,
  STOCK_CHECK_RESULT_LABELS,
  STOCK_CHECK_STATUS_LABELS,
} from '@company/constants';

export const inventoryTransactionTypeLabels = INVENTORY_TRANSACTION_TYPE_LABELS satisfies Record<
  InventoryTransactionType,
  string
>;

export const inventoryReferenceTypeLabels = INVENTORY_REFERENCE_TYPE_LABELS satisfies Record<
  InventoryReferenceType,
  string
>;

export const inventorySourceTypeLabels = INVENTORY_SOURCE_TYPE_LABELS satisfies Record<
  InventorySourceType,
  string
>;

export const inventoryBatchStatusLabels = {
  available: '可用',
  frozen: '冻结',
  disabled: '停用',
} satisfies Record<InventoryBatchStatus, string>;

export const stockStatusLabels = {
  available: '可用',
  pending_inspection: '待检',
  frozen: '冻结',
  defective: '不良',
} satisfies Record<StockStatus, string>;

export const returnOrderStatusLabels = RETURN_ORDER_STATUS_LABELS satisfies Record<
  ReturnOrderStatus,
  string
>;

export const scrapStatusLabels = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消',
} satisfies Record<ScrapStatus, string>;

export const stockCheckStatusLabels = STOCK_CHECK_STATUS_LABELS satisfies Record<
  StockCheckStatus,
  string
>;

export const stockCheckResultLabels = STOCK_CHECK_RESULT_LABELS satisfies Record<
  StockCheckResult,
  string
>;

export const inventorySourceTypeLabel = (value: InventorySourceType) =>
  inventorySourceTypeLabels[value];
export const inventoryBatchStatusLabel = (value: InventoryBatchStatus) =>
  inventoryBatchStatusLabels[value];
export const stockStatusLabel = (value: StockStatus) => stockStatusLabels[value];
export const inventoryTransactionTypeLabel = (value: InventoryTransactionType) =>
  inventoryTransactionTypeLabels[value];
export const inventoryReferenceTypeLabel = (value: InventoryReferenceType) =>
  inventoryReferenceTypeLabels[value];
export const returnOrderStatusLabel = (value: ReturnOrderStatus) => returnOrderStatusLabels[value];
export const scrapStatusLabel = (value: ScrapStatus) => scrapStatusLabels[value];
export const stockCheckStatusLabel = (value: StockCheckStatus) => stockCheckStatusLabels[value];
export const stockCheckResultLabel = (value: StockCheckResult) => stockCheckResultLabels[value];
