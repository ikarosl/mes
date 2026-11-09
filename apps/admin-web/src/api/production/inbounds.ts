import type {
  PageResult,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { request } from './request';

export const productionInboundsApi = {
  listPurchaseInbounds: (
    params: PurchaseInboundOrderQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<PurchaseInboundOrderItem>> =>
    request<PageResult<PurchaseInboundOrderItem>>({
      url: '/production/purchase-inbounds',
      params,
      signal,
      skipErrorHandling: true,
    }),

  getPurchaseInbound: (id: string, signal?: AbortSignal): Promise<PurchaseInboundOrderItem> =>
    request<PurchaseInboundOrderItem>({
      url: `/production/purchase-inbounds/${id}`,
      signal,
      skipErrorHandling: true,
    }),
};
