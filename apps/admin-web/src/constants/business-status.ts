import type {
  InboundOrderStatus,
  InventoryBatchStatus,
  InventorySourceType,
  OutboundOrderStatus,
  ReturnOrderStatus,
  ScrapScene,
  ScrapStatus,
  StockCheckResult,
  StockCheckStatus,
  StockStatus,
} from '@company/contracts';

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

export const outboundOrderStatusLabels = {
  pending_picking: '待拣货',
  picked: '已拣货',
  partially_outbound: '部分出库',
  completed: '已完成',
  cancelled: '已取消',
} satisfies Record<OutboundOrderStatus, string>;

export const returnOrderStatusLabels = {
  pending: '待处理',
  returned: '已入库',
  scrapped: '已报废',
  cancelled: '已取消',
} satisfies Record<ReturnOrderStatus, string>;

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

export const stockCheckStatusLabels = {
  pending: '待盘点',
  counting: '盘点中',
  completed: '已完成',
  cancelled: '已取消',
} satisfies Record<StockCheckStatus, string>;

export const stockCheckResultLabels = {
  surplus: '盘盈',
  shortage: '盘亏',
  matched: '一致',
} satisfies Record<StockCheckResult, string>;

export const inventorySourceTypeLabel = (value: InventorySourceType) =>
  inventorySourceTypeLabels[value];
export const inventoryBatchStatusLabel = (value: InventoryBatchStatus) =>
  inventoryBatchStatusLabels[value];
export const stockStatusLabel = (value: StockStatus) => stockStatusLabels[value];
export const inboundOrderStatusLabel = (value: InboundOrderStatus) =>
  inboundOrderStatusLabels[value];
export const outboundOrderStatusLabel = (value: OutboundOrderStatus) =>
  outboundOrderStatusLabels[value];
export const returnOrderStatusLabel = (value: ReturnOrderStatus) => returnOrderStatusLabels[value];
export const scrapStatusLabel = (value: ScrapStatus) => scrapStatusLabels[value];
export const stockCheckStatusLabel = (value: StockCheckStatus) => stockCheckStatusLabels[value];
export const stockCheckResultLabel = (value: StockCheckResult) => stockCheckResultLabels[value];
