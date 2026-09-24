import type {
  FinishedInspectionCommandResult,
  FinishedInspectionTaskDetail,
  FinishedInspectionTaskItem,
  FinishedInspectionTaskQuery,
  PageQuery,
  PageResult,
  ProductionOutputInspection,
  RecordFinishedInspectionPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

async function request<T>(config: RetryRequestConfig): Promise<T> {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
}
const root = '/quality/finished-inspections';
export const finishedInspectionsApi = {
  list: (params: FinishedInspectionTaskQuery, signal?: AbortSignal) =>
    request<PageResult<FinishedInspectionTaskItem>>({
      url: root,
      params,
      signal,
      skipErrorHandling: true,
    }),
  detail: (batchId: string, signal?: AbortSignal) =>
    request<FinishedInspectionTaskDetail>({
      url: `${root}/${batchId}`,
      signal,
      skipErrorHandling: true,
    }),
  records: (batchId: string, params: PageQuery, signal?: AbortSignal) =>
    request<PageResult<ProductionOutputInspection>>({
      url: `${root}/${batchId}/records`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  record: (batchId: string, data: RecordFinishedInspectionPayload, key: string) =>
    request<FinishedInspectionCommandResult>({
      url: `${root}/${batchId}/actions/record`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      retryIdempotentWrite: true,
      retryTimes: 2,
      skipErrorHandling: true,
    }),
};
