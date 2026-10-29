import type {
  OtherInventoryDirection,
  OtherInventoryDraftPayload,
  OtherInventoryOrder,
  OtherInventoryOrderQuery,
  OtherStockCandidate,
  OtherStockCandidateQuery,
  OtherStockMaterialQuery,
  OtherStockMaterials,
  OtherStockObjectQuery,
  OtherStockObjects,
  PageResult,
  SaveOtherInventoryDraftPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig): Promise<T> => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};
const orderPath = (direction: OtherInventoryDirection): string =>
  direction === 'inbound' ? '/warehouse/other-inbounds' : '/warehouse/other-outbounds';
const idempotencyOptions = (idempotencyKey: string): RetryRequestConfig => ({
  headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
});

export const otherInventoryApi = {
  list: (
    direction: OtherInventoryDirection,
    params: OtherInventoryOrderQuery,
    signal?: AbortSignal,
  ) =>
    request<PageResult<OtherInventoryOrder>>({
      url: orderPath(direction),
      params,
      signal,
      skipErrorHandling: true,
    }),
  get: (direction: OtherInventoryDirection, orderId: string, signal?: AbortSignal) =>
    request<OtherInventoryOrder>({
      url: `${orderPath(direction)}/${orderId}`,
      signal,
      skipErrorHandling: true,
    }),
  create: (
    direction: OtherInventoryDirection,
    data: OtherInventoryDraftPayload,
    idempotencyKey: string,
  ) =>
    request<OtherInventoryOrder>({
      ...idempotencyOptions(idempotencyKey),
      url: orderPath(direction),
      method: 'POST',
      data,
    }),
  save: (
    direction: OtherInventoryDirection,
    orderId: string,
    data: SaveOtherInventoryDraftPayload,
    idempotencyKey: string,
  ) =>
    request<OtherInventoryOrder>({
      ...idempotencyOptions(idempotencyKey),
      url: `${orderPath(direction)}/${orderId}`,
      method: 'PATCH',
      data,
    }),
  confirm: (
    direction: OtherInventoryDirection,
    orderId: string,
    version: number,
    idempotencyKey: string,
  ) =>
    request<OtherInventoryOrder>({
      ...idempotencyOptions(idempotencyKey),
      url: `${orderPath(direction)}/${orderId}/actions/confirm`,
      method: 'POST',
      data: { version },
    }),
  cancel: (
    direction: OtherInventoryDirection,
    orderId: string,
    data: { version: number; reason: string },
    idempotencyKey: string,
  ) =>
    request<OtherInventoryOrder>({
      ...idempotencyOptions(idempotencyKey),
      url: `${orderPath(direction)}/${orderId}/actions/cancel`,
      method: 'POST',
      data,
    }),
  stockCandidates: (params: OtherStockCandidateQuery, signal?: AbortSignal) =>
    request<PageResult<OtherStockCandidate>>({
      url: '/warehouse/other-stock-candidates',
      params,
      signal,
      skipErrorHandling: true,
    }),
  stockObjects: (params: OtherStockObjectQuery, signal?: AbortSignal) =>
    request<OtherStockObjects>({
      url: '/warehouse/other-stock-objects',
      params,
      signal,
      skipErrorHandling: true,
    }),
  stockMaterials: (params: OtherStockMaterialQuery, signal?: AbortSignal) =>
    request<OtherStockMaterials>({
      url: '/warehouse/other-stock-materials',
      params,
      signal,
      skipErrorHandling: true,
    }),
};
