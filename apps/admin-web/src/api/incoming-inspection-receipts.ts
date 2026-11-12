import type {
  PageQuery,
  PageResult,
  QualityIncomingInspectionLocation,
  QualityIncomingInspectionReceiptItem,
  QualityIncomingInspectionReceiptLines,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

// Shared receipt reads retain their published paths after inspection grouping is retired.
const base = '/quality/inbound-inspection-orders';
const request = async <T>(config: RetryRequestConfig): Promise<T> => {
  try {
    return (await httpClient.request<T>({ skipErrorHandling: true, ...config })).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const incomingInspectionReceiptsApi = {
  list: (
    params: PageQuery & { keyword?: string },
    signal?: AbortSignal,
  ): Promise<PageResult<QualityIncomingInspectionReceiptItem>> =>
    request({
      url: `${base}/receipt-candidates`,
      params: { ...params, association: 'all' },
      signal,
    }),
  lines: (
    receiptId: string,
    signal?: AbortSignal,
  ): Promise<QualityIncomingInspectionReceiptLines> =>
    request({ url: `${base}/receipts/${receiptId}/lines`, signal }),
  locate: (
    receiptLineId: string,
    signal?: AbortSignal,
  ): Promise<QualityIncomingInspectionLocation> =>
    request({ url: `${base}/receipt-lines/${receiptLineId}/location`, signal }),
};
