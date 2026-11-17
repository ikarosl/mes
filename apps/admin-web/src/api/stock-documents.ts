import type {
  PageResult,
  StockDocumentDirection,
  StockDocumentOrder,
  StockDocumentQuery,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

async function request<T>(config: RetryRequestConfig): Promise<T> {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
}

export const stockDocumentsApi = {
  async list(
    params: StockDocumentQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<StockDocumentOrder>> {
    return request({ url: '/warehouse/stock-documents', params, signal, skipErrorHandling: true });
  },
  async get(
    direction: StockDocumentDirection,
    id: string,
    signal?: AbortSignal,
  ): Promise<StockDocumentOrder> {
    return request({
      url: `/warehouse/stock-documents/${direction}/${id}`,
      signal,
      skipErrorHandling: true,
    });
  },
};
