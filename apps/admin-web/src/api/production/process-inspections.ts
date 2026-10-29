import type {
  AcceptProcessInspectionPayload,
  BatchStepAbnormalDispositionItem,
  PageQuery,
  PageResult,
  ProcessInspectionDispositionHistoryItem,
  ProcessInspectionEntry,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request } from './request';

const stepRoot = (batchId: string, stepId: string): string =>
  `/production/batches/${batchId}/step-records/${stepId}`;

export const productionProcessInspectionsApi = {
  history: (
    batchId: string,
    stepId: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcessInspectionDispositionHistoryItem>> =>
    request<PageResult<ProcessInspectionDispositionHistoryItem>>({
      skipErrorHandling: true,
      url: `${stepRoot(batchId, stepId)}/inspection-dispositions`,
      params,
      signal,
    }),

  list: (
    batchId: string,
    stepId: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcessInspectionEntry>> =>
    request<PageResult<ProcessInspectionEntry>>({
      skipErrorHandling: true,
      url: `${stepRoot(batchId, stepId)}/process-inspections`,
      params,
      signal,
    }),

  detail: (
    batchId: string,
    stepId: string,
    inspectionId: string,
    signal?: AbortSignal,
  ): Promise<ProcessInspectionEntry> =>
    request<ProcessInspectionEntry>({
      skipErrorHandling: true,
      url: `${stepRoot(batchId, stepId)}/process-inspections/${inspectionId}`,
      signal,
    }),

  accept: (
    batchId: string,
    stepId: string,
    data: AcceptProcessInspectionPayload,
    key: string,
  ): Promise<BatchStepAbnormalDispositionItem> =>
    request<BatchStepAbnormalDispositionItem>({
      skipErrorHandling: true,
      url: `${stepRoot(batchId, stepId)}/inspection-dispositions`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
    }),
};
