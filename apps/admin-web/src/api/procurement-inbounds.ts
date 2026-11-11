import type {
  ConfirmProcurementInboundPayload,
  ConfirmProcurementInboundResult,
  PageResult,
  ProcurementInboundSourceItem,
  ProcurementInboundSourceQuery,
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
  sources: (
    params: ProcurementInboundSourceQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementInboundSourceItem>> =>
    request({
      url: '/procurement/inbound-sources',
      params: {
        ...params,
        receiptLineIds: params.receiptLineIds?.length ? params.receiptLineIds.join(',') : undefined,
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
    }),
};
