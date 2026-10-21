import type {
  AcceptProcessInspectionPayload,
  BatchStepAbnormalDispositionItem,
  PageQuery,
  PageResult,
  ProcessInspectionDispositionHistoryItem,
  ProcessInspectionEntry,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

async function request<T>(config: RetryRequestConfig): Promise<T> {
  try {
    return (await httpClient.request<T>({ skipErrorHandling: true, ...config })).data;
  } catch (error) {
    throw toRequestError(error);
  }
}
const stepRoot = (batchId: string, stepId: string): string =>
  `/production/batches/${batchId}/step-records/${stepId}`;

export const productionProcessInspectionsApi = {
  history: (batchId: string, stepId: string, params: PageQuery, signal?: AbortSignal) =>
    request<PageResult<ProcessInspectionDispositionHistoryItem>>({
      url: `${stepRoot(batchId, stepId)}/inspection-dispositions`,
      params,
      signal,
    }),
  list: (batchId: string, stepId: string, params: PageQuery, signal?: AbortSignal) =>
    request<PageResult<ProcessInspectionEntry>>({
      url: `${stepRoot(batchId, stepId)}/process-inspections`,
      params,
      signal,
    }),
  detail: (batchId: string, stepId: string, inspectionId: string, signal?: AbortSignal) =>
    request<ProcessInspectionEntry>({
      url: `${stepRoot(batchId, stepId)}/process-inspections/${inspectionId}`,
      signal,
    }),
  accept: (batchId: string, stepId: string, data: AcceptProcessInspectionPayload, key: string) =>
    request<BatchStepAbnormalDispositionItem>({
      url: `${stepRoot(batchId, stepId)}/inspection-dispositions`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      retryIdempotentWrite: true,
      retryTimes: 2,
    }),
};
