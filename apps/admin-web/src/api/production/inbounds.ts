import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundOrderDetail,
  ConfirmFinishedGoodsInboundPayload,
  FinishedGoodsInboundCommandResult,
  PageResult,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request } from './request';

export const productionInboundsApi = {
  listFinishedGoodsInbounds: (
    params: FinishedGoodsInboundQuery,
  ): Promise<PageResult<FinishedGoodsInboundOrderItem>> =>
    request<PageResult<FinishedGoodsInboundOrderItem>>({
      url: '/production/finished-goods-inbounds',
      params,
      skipErrorHandling: true,
    }),

  finishedGoodsInboundCandidates: (
    params: FinishedGoodsInboundCandidateQuery,
  ): Promise<PageResult<FinishedGoodsInboundCandidate>> =>
    request<PageResult<FinishedGoodsInboundCandidate>>({
      url: '/production/finished-goods-inbounds/candidates',
      params,
      skipErrorHandling: true,
    }),

  getFinishedGoodsInbound: (id: string): Promise<FinishedGoodsInboundOrderDetail> =>
    request<FinishedGoodsInboundOrderDetail>({
      url: `/production/finished-goods-inbounds/${id}`,
      skipErrorHandling: true,
    }),

  confirmFinishedGoodsInbound: (
    data: ConfirmFinishedGoodsInboundPayload,
    idempotencyKey: string,
  ): Promise<FinishedGoodsInboundCommandResult> =>
    request<FinishedGoodsInboundCommandResult>({
      url: '/production/finished-goods-inbounds/actions/confirm',
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

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
