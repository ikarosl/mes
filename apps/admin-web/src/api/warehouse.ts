import type {
  CreateReturnOrderPayload,
  CreateStockCheckPayload,
  CreateMaterialLossPayload,
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  MaterialLossQuery,
  PageResult,
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
  ReturnOrderQuery,
  SaveStockCheckCountsPayload,
  StockCheckCandidateItem,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const warehouseApi = {
  listMaterialLosses: (params: MaterialLossQuery) =>
    request<PageResult<MaterialLossItem>>({ url: '/warehouse/scraps', params }),
  getMaterialLoss: (scrapId: string) =>
    request<MaterialLossItem>({ url: `/warehouse/scraps/${scrapId}` }),
  listMaterialLossBatchOptions: () =>
    request<MaterialLossBatchOption[]>({ url: '/warehouse/scraps/batch-options' }),
  listMaterialLossCandidates: (batchId: string) =>
    request<MaterialLossCandidateItem[]>({
      url: `/warehouse/scraps/batches/${batchId}/candidates`,
    }),
  createMaterialLoss: (data: CreateMaterialLossPayload, idempotencyKey: string) =>
    request<MaterialLossItem>({
      url: '/warehouse/scraps',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),
  confirmMaterialLoss: (scrapId: string, version: number, idempotencyKey: string) =>
    request<MaterialLossItem>({
      url: `/warehouse/scraps/${scrapId}/actions/confirm`,
      method: 'POST',
      data: { version },
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),
  cancelMaterialLoss: (scrapId: string, version: number) =>
    request<MaterialLossItem>({
      url: `/warehouse/scraps/${scrapId}/actions/cancel`,
      method: 'POST',
      data: { version },
    }),

  listReturnOrders: (params: ReturnOrderQuery) =>
    request<PageResult<ReturnOrderItem>>({ url: '/warehouse/return-orders', params }),
  getReturnOrder: (returnId: string) =>
    request<ReturnOrderItem>({ url: `/warehouse/return-orders/${returnId}` }),
  listReturnBatchOptions: () =>
    request<ReturnOrderBatchOption[]>({ url: '/warehouse/return-orders/batch-options' }),
  listReturnCandidates: (batchId: string) =>
    request<ReturnOrderCandidateItem[]>({
      url: `/warehouse/return-orders/batches/${batchId}/candidates`,
    }),
  createReturnOrder: (data: CreateReturnOrderPayload) =>
    request<ReturnOrderItem>({ url: '/warehouse/return-orders', method: 'POST', data }),
  confirmReturnOrder: (returnId: string, version: number) =>
    request<ReturnOrderItem>({
      url: `/warehouse/return-orders/${returnId}/actions/confirm`,
      method: 'POST',
      data: { version },
    }),
  cancelReturnOrder: (returnId: string, version: number) =>
    request<ReturnOrderItem>({
      url: `/warehouse/return-orders/${returnId}/actions/cancel`,
      method: 'POST',
      data: { version },
    }),

  listStockChecks: (params: StockCheckOrderQuery) =>
    request<PageResult<StockCheckOrderItem>>({ url: '/warehouse/stock-checks', params }),
  getStockCheck: (stockCheckId: string) =>
    request<StockCheckOrderItem>({ url: `/warehouse/stock-checks/${stockCheckId}` }),
  listStockCheckCandidates: (params: StockCheckCandidateQuery) =>
    request<PageResult<StockCheckCandidateItem>>({
      url: '/warehouse/stock-checks/candidates',
      params,
    }),
  createStockCheck: (data: CreateStockCheckPayload) =>
    request<StockCheckOrderItem>({ url: '/warehouse/stock-checks', method: 'POST', data }),
  saveStockCheckCounts: (stockCheckId: string, data: SaveStockCheckCountsPayload) =>
    request<StockCheckOrderItem>({
      url: `/warehouse/stock-checks/${stockCheckId}`,
      method: 'PATCH',
      data,
    }),
  completeStockCheck: (stockCheckId: string, version: number) =>
    request<StockCheckOrderItem>({
      url: `/warehouse/stock-checks/${stockCheckId}/actions/complete`,
      method: 'POST',
      data: { version },
    }),
  cancelStockCheck: (stockCheckId: string, version: number) =>
    request<StockCheckOrderItem>({
      url: `/warehouse/stock-checks/${stockCheckId}/actions/cancel`,
      method: 'POST',
      data: { version },
    }),
};
