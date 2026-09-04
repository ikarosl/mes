import type {
  InboundOrderStatus,
  InventoryBatchStatus,
  InventoryReferenceType,
  InventorySourceType,
  InventoryTransactionType,
  OutboundOrderStatus,
  ReturnOrderStatus,
  ScrapScene,
  ScrapStatus,
  StockCheckResult,
  StockCheckStatus,
  StockStatus,
} from '@company/contracts';
import {
  INVENTORY_REFERENCE_TYPE_LABELS,
  INVENTORY_TRANSACTION_TYPE_LABELS,
  OUTBOUND_ORDER_STATUS_LABELS,
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

export const inventorySourceTypeLabels = {
  self_made: '自产',
  purchased: '外购',
  outsourced: '委外',
  return_inbound: '退货入库',
  stock_check_generated: '盘点生成',
  other: '其他',
} satisfies Record<InventorySourceType, string>;

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

export const inboundOrderStatusLabels = {
  pending: '待确认',
  completed: '已完成',
  cancelled: '已取消',
} satisfies Record<InboundOrderStatus, string>;

export const outboundOrderStatusLabels = OUTBOUND_ORDER_STATUS_LABELS satisfies Record<
  OutboundOrderStatus,
  string
>;

export const returnOrderStatusLabels = RETURN_ORDER_STATUS_LABELS satisfies Record<
  ReturnOrderStatus,
  string
>;

export const scrapStatusLabels = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消',
} satisfies Record<ScrapStatus, string>;

export const scrapSceneLabels = {
  warehouse_allocated: '已分配报废',
  return_after_outbound: '退料后报废',
  production_consumed: '生产消耗报废',
  in_stock: '库存内报废',
} satisfies Record<ScrapScene, string>;

export const stockCheckStatusLabels = STOCK_CHECK_STATUS_LABELS satisfies Record<
  StockCheckStatus,
  string
>;

export const stockCheckResultLabels = STOCK_CHECK_RESULT_LABELS satisfies Record<
  StockCheckResult,
  string
>;

/** 生产物料需求持久化业务状态；管理台契约在逐步补齐时仍保留未知值原样展示。 */
export const demandBusinessStatusLabels: Record<string, string> = {
  active: '有效',
  fulfilled: '已满足',
  cancelled: '已取消',
};

export const inventorySourceTypeLabel = (value: InventorySourceType) =>
  inventorySourceTypeLabels[value];
export const inventoryBatchStatusLabel = (value: InventoryBatchStatus) =>
  inventoryBatchStatusLabels[value];
export const stockStatusLabel = (value: StockStatus) => stockStatusLabels[value];
export const inventoryTransactionTypeLabel = (value: InventoryTransactionType) =>
  inventoryTransactionTypeLabels[value];
export const inventoryReferenceTypeLabel = (value: InventoryReferenceType) =>
  inventoryReferenceTypeLabels[value];
export const inboundOrderStatusLabel = (value: InboundOrderStatus) =>
  inboundOrderStatusLabels[value];
export const outboundOrderStatusLabel = (value: OutboundOrderStatus) =>
  outboundOrderStatusLabels[value];
export const returnOrderStatusLabel = (value: ReturnOrderStatus) => returnOrderStatusLabels[value];
export const scrapStatusLabel = (value: ScrapStatus) => scrapStatusLabels[value];
export const stockCheckStatusLabel = (value: StockCheckStatus) => stockCheckStatusLabels[value];
export const stockCheckResultLabel = (value: StockCheckResult) => stockCheckResultLabels[value];
export const demandBusinessStatusLabel = (value: string): string =>
  demandBusinessStatusLabels[value] ?? value;
