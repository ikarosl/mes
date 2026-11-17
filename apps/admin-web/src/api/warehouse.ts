import type {
  CreateReturnOrderPayload,
  CancelReturnOrderPayload,
  CancelMaterialLossPayload,
  CreateMaterialLossPayload,
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  MaterialLossQuery,
  PageResult,
  InventoryInboundBatchCandidate,
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
  StockCheckOrderItem,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const warehouseApi = {
  getStockCheck: (id: string, signal?: AbortSignal) =>
    request<StockCheckOrderItem>({
      url: `/warehouse/stock-checks/${id}`,
      signal,
      skipErrorHandling: true,
    }),
  listInboundBatchCandidates: (
    params: {
      itemKind: 'material' | 'finished_product';
      materialVariantId?: string;
      productId?: string;
      unit: string;
      keyword?: string;
      page: number;
      pageSize: number;
    },
    signal?: AbortSignal,
  ) =>
    request<PageResult<InventoryInboundBatchCandidate>>({
      url:
        params.itemKind === 'material'
          ? '/warehouse/material-inbound-batch-candidates'
          : '/warehouse/finished-inbound-batch-candidates',
      params: {
        materialVariantId: params.materialVariantId,
        productId: params.productId,
        unit: params.unit,
        keyword: params.keyword,
        page: params.page,
        pageSize: params.pageSize,
      },
      signal,
      skipErrorHandling: true,
    }),
  listMaterialLosses: (params: MaterialLossQuery) =>
    request<PageResult<MaterialLossItem>>({ url: '/warehouse/scraps', params }),
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
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
  confirmMaterialLoss: (scrapId: string, version: number, idempotencyKey: string) =>
    request<MaterialLossItem>({
      url: `/warehouse/scraps/${scrapId}/actions/confirm`,
      method: 'POST',
      data: { version },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
  cancelMaterialLoss: (scrapId: string, data: CancelMaterialLossPayload) =>
    request<MaterialLossItem>({
      url: `/warehouse/scraps/${scrapId}/actions/cancel`,
      method: 'POST',
      data,
    }),

  getReturnOrder: (returnId: string, signal?: AbortSignal) =>
    request<ReturnOrderItem>({
      url: `/warehouse/return-orders/${returnId}`,
      signal,
      skipErrorHandling: true,
    }),
  listReturnBatchOptions: (signal?: AbortSignal) =>
    request<ReturnOrderBatchOption[]>({
      url: '/warehouse/return-orders/batch-options',
      signal,
      skipErrorHandling: true,
    }),
  listReturnCandidates: (batchId: string, signal?: AbortSignal) =>
    request<ReturnOrderCandidateItem[]>({
      url: `/warehouse/return-orders/batches/${batchId}/candidates`,
      signal,
      skipErrorHandling: true,
    }),
  createReturnOrder: (data: CreateReturnOrderPayload) =>
    request<ReturnOrderItem>({ url: '/warehouse/return-orders', method: 'POST', data }),
  confirmReturnOrder: (returnId: string, version: number) =>
    request<ReturnOrderItem>({
      url: `/warehouse/return-orders/${returnId}/actions/confirm`,
      method: 'POST',
      data: { version },
    }),
  cancelReturnOrder: (returnId: string, data: CancelReturnOrderPayload) =>
    request<ReturnOrderItem>({
      url: `/warehouse/return-orders/${returnId}/actions/cancel`,
      method: 'POST',
      data,
    }),
};
