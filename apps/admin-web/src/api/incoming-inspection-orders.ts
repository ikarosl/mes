import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  CreateQualityIncomingInspectionOrderResult,
  PageQuery,
  PageResult,
  QualityIncomingInspectionAssociationResult,
  QualityIncomingInspectionLocation,
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionOrderQuery,
  QualityIncomingInspectionOrderReceiptPage,
  QualityIncomingInspectionReceiptCandidateQuery,
  QualityIncomingInspectionReceiptItem,
  QualityIncomingInspectionReceiptLines,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const base = '/quality/inbound-inspection-orders';
const request = async <T>(config: RetryRequestConfig): Promise<T> => {
  try {
    return (await httpClient.request<T>({ skipErrorHandling: true, ...config })).data;
  } catch (error) {
    throw toRequestError(error);
  }
};
const command = <T>(url: string, data: unknown, key: string, method = 'POST'): Promise<T> =>
  request({
    url,
    method,
    data,
    headers: { [IDEMPOTENCY_KEY_HEADER]: key },
    retryIdempotentWrite: true,
    retryTimes: 2,
  });

export const incomingInspectionOrdersApi = {
  list: (
    params: QualityIncomingInspectionOrderQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<QualityIncomingInspectionOrderItem>> =>
    request({ url: base, params, signal }),
  get: (orderId: string, signal?: AbortSignal): Promise<QualityIncomingInspectionOrderItem> =>
    request({ url: `${base}/${orderId}`, signal }),
  targets: (
    params: PageQuery & { keyword?: string },
    signal?: AbortSignal,
  ): Promise<PageResult<QualityIncomingInspectionOrderItem>> =>
    request({ url: `${base}/targets`, params, signal }),
  receipts: (
    orderId: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<QualityIncomingInspectionOrderReceiptPage> =>
    request({ url: `${base}/${orderId}/receipts`, params, signal }),
  candidates: (
    params: QualityIncomingInspectionReceiptCandidateQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<QualityIncomingInspectionReceiptItem>> =>
    request({ url: `${base}/receipt-candidates`, params, signal }),
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
  create: (
    body: CreateQualityIncomingInspectionOrderPayload,
    key: string,
  ): Promise<CreateQualityIncomingInspectionOrderResult> => command(base, body, key),
  updateRemark: (
    orderId: string,
    body: UpdateQualityIncomingInspectionOrderPayload,
    key: string,
  ): Promise<QualityIncomingInspectionOrderItem> =>
    command(`${base}/${orderId}`, body, key, 'PATCH'),
  changeAssociations: (
    body: ChangeQualityIncomingInspectionAssociationsPayload,
    key: string,
  ): Promise<QualityIncomingInspectionAssociationResult> =>
    command(`${base}/associations`, body, key),
};
