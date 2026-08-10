/**
 * TODO(warehouse-api): 仓储管理模块后端接口尚未迁移。
 * 以下类型定义基于 docs/database/30-production-inventory/README.md 及其主题章节，供后续开发参考。
 * 当前页面使用静态演示数据，待后端控制器实现后接入。
 */

/* ====== 库存批次现存量 ====== */
export interface ItemBatchStockItem {
  id: string;
  batchId: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  itemKind: string;
  batchCode: string;
  sourceType: string;
  provider: string | null;
  sourceWorkOrderId: string | null;
  sourceProductionBatchId: string | null;
  batchStatus: string;
  availableQuantity: string;
  pendingQuantity: string;
  frozenQuantity: string;
  defectiveQuantity: string;
  totalQuantity: string;
}

/* ====== 入库管理 ====== */
export interface InboundOrderItem {
  id: string;
  inboundNo: string;
  sourceType: string;
  provider: string | null;
  status: string;
  detailCount: number;
  totalInboundNumber: string;
  inboundAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface InboundDetailItem {
  id: string;
  inboundId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchId: string;
  batchCode: string;
  inboundNumber: string;
  unit: string;
  stockStatus: string;
}

/* ====== 出库管理 ====== */
export interface OutboundOrderItem {
  id: string;
  outboundNo: string;
  productionBatchId: string;
  status: string;
  detailCount: number;
  totalOutboundNumber: string;
  outboundAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface OutboundDetailItem {
  id: string;
  outboundId: string;
  allocationId: string;
  demandId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchId: string;
  batchCode: string;
  outboundNumber: string;
  unit: string;
}

/* ====== 退料管理 ====== */
export interface ReturnOrderItem {
  id: string;
  returnNo: string;
  productionBatchId: string;
  workOrderId: string | null;
  status: string;
  totalReturnNumber: string;
  returnAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface ReturnDetailItem {
  id: string;
  returnId: string;
  allocationId: string;
  demandId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchId: string;
  batchCode: string;
  returnNumber: string;
  unit: string;
  returnStockStatus: string;
  releaseAfterReturn: boolean;
}

/* ====== 报废管理 ====== */
export interface ItemScrapItem {
  id: string;
  scrapNo: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  scrapScene: string;
  scrapNumber: string;
  unit: string;
  reason: string | null;
  status: string;
  remark: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

/* ====== 盘点管理 ====== */
export interface StockCheckItem {
  id: string;
  checkNo: string;
  status: string;
  detailCount: number;
  pendingItems: number;
  startedAt: string | null;
  completedAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface StockCheckDetailItem {
  id: string;
  stockCheckId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchId: string;
  batchCode: string;
  stockStatus: string;
  systemQuantity: string;
  actualQuantity: string;
  differenceQuantity: string;
  result: string;
  adjusted: boolean;
}

/* ====== 生产物料分配 ====== */
export interface ProductionItemAllocationItem {
  id: string;
  demandId: string;
  productionBatchId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchId: string;
  batchCode: string;
  assignedNumber: string;
  allocationStatus: string;
}

/**
 * TODO(warehouse-api): 仓储管理 API 客户端。
 * 后端仓储模块尚未迁移，以下方法均为占位定义。
 * 待后端实现后，取消注释并接入真实 endpoint。
 */
export const warehouseApi = {
  // ─── 库存现存量 ────────────────────────────────
  // listInventory: (params) =>
  //   request<PageResult<ItemBatchStockItem>>({ url: '/warehouse/inventory', params }),
  // ─── 入库管理 ────────────────────────────────────
  // listInboundOrders: (params) =>
  //   request<PageResult<InboundOrderItem>>({ url: '/warehouse/inbound-orders', params }),
  // getInboundOrder: (id) =>
  //   request<InboundOrderItem & { details: InboundDetailItem[] }>({ url: `/warehouse/inbound-orders/${id}` }),
  // createInboundOrder: (data) =>
  //   request<InboundOrderItem>({ url: '/warehouse/inbound-orders', method: 'POST', data }),
  // confirmInboundOrder: (id) =>
  //   request<InboundOrderItem>({ url: `/warehouse/inbound-orders/${id}/actions/confirm`, method: 'POST' }),
  // cancelInboundOrder: (id) =>
  //   request<InboundOrderItem>({ url: `/warehouse/inbound-orders/${id}/actions/cancel`, method: 'POST' }),
  // ─── 出库管理 ────────────────────────────────────
  // listOutboundOrders: (params) =>
  //   request<PageResult<OutboundOrderItem>>({ url: '/warehouse/outbound-orders', params }),
  // getOutboundOrder: (id) =>
  //   request<OutboundOrderItem & { details: OutboundDetailItem[] }>({ url: `/warehouse/outbound-orders/${id}` }),
  // createOutboundOrder: (data) =>
  //   request<OutboundOrderItem>({ url: '/warehouse/outbound-orders', method: 'POST', data }),
  // confirmOutboundOrder: (id) =>
  //   request<OutboundOrderItem>({ url: `/warehouse/outbound-orders/${id}/actions/confirm`, method: 'POST' }),
  // cancelOutboundOrder: (id) =>
  //   request<OutboundOrderItem>({ url: `/warehouse/outbound-orders/${id}/actions/cancel`, method: 'POST' }),
  // ─── 退料管理 ────────────────────────────────────
  // listReturnOrders: (params) =>
  //   request<PageResult<ReturnOrderItem>>({ url: '/warehouse/return-orders', params }),
  // getReturnOrder: (id) =>
  //   request<ReturnOrderItem & { details: ReturnDetailItem[] }>({ url: `/warehouse/return-orders/${id}` }),
  // createReturnOrder: (data) =>
  //   request<ReturnOrderItem>({ url: '/warehouse/return-orders', method: 'POST', data }),
  // confirmReturnInbound: (id) =>
  //   request<ReturnOrderItem>({ url: `/warehouse/return-orders/${id}/actions/confirm-inbound`, method: 'POST' }),
  // cancelReturnOrder: (id) =>
  //   request<ReturnOrderItem>({ url: `/warehouse/return-orders/${id}/actions/cancel`, method: 'POST' }),
  // ─── 报废管理 ────────────────────────────────────
  // listScraps: (params) =>
  //   request<PageResult<ItemScrapItem>>({ url: '/warehouse/scraps', params }),
  // getScrap: (id) =>
  //   request<ItemScrapItem>({ url: `/warehouse/scraps/${id}` }),
  // createScrap: (data) =>
  //   request<ItemScrapItem>({ url: '/warehouse/scraps', method: 'POST', data }),
  // confirmScrap: (id) =>
  //   request<ItemScrapItem>({ url: `/warehouse/scraps/${id}/actions/confirm`, method: 'POST' }),
  // cancelScrap: (id) =>
  //   request<ItemScrapItem>({ url: `/warehouse/scraps/${id}/actions/cancel`, method: 'POST' }),
  // ─── 盘点管理 ────────────────────────────────────
  // listStockChecks: (params) =>
  //   request<PageResult<StockCheckItem>>({ url: '/warehouse/stock-checks', params }),
  // getStockCheck: (id) =>
  //   request<StockCheckItem & { details: StockCheckDetailItem[] }>({ url: `/warehouse/stock-checks/${id}` }),
  // createStockCheck: (data) =>
  //   request<StockCheckItem>({ url: '/warehouse/stock-checks', method: 'POST', data }),
  // updateStockCheck: (id, data) =>
  //   request<StockCheckItem>({ url: `/warehouse/stock-checks/${id}`, method: 'PATCH', data }),
  // completeStockCheck: (id) =>
  //   request<StockCheckItem>({ url: `/warehouse/stock-checks/${id}/actions/complete`, method: 'POST' }),
  // cancelStockCheck: (id) =>
  //   request<StockCheckItem>({ url: `/warehouse/stock-checks/${id}/actions/cancel`, method: 'POST' }),
  // generateStockAdjustments: (id) =>
  //   request<void>({ url: `/warehouse/stock-checks/${id}/actions/adjust`, method: 'POST' }),
};
