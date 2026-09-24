import type {
  ConfirmProcurementInboundPayload,
  ConfirmProcurementInboundResult,
  PageResult,
  ProcurementInboundReleaseItem,
  ProcurementInboundReleaseQuery,
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

export const procurementInboundsApi = {
  releases: (
    params: ProcurementInboundReleaseQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementInboundReleaseItem>> =>
    request({
      url: '/procurement/inbound-releases',
      params: {
        ...params,
        allocationIds: params.allocationIds?.length ? params.allocationIds.join(',') : undefined,
      },
      signal,
      skipErrorHandling: true,
    }),
  confirm: (
    data: ConfirmProcurementInboundPayload,
    key: string,
  ): Promise<ConfirmProcurementInboundResult> =>
    request({
      url: '/procurement/purchase-inbounds/actions/confirm',
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      retryIdempotentWrite: true,
      retryTimes: 2,
    }),
};
