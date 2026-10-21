import type {
  CreateProcessInspectionPayload,
  CorrectProcessInspectionPayload,
  ReverseProcessInspectionPayload,
  ProcessInspectionEntry,
  ProcessInspectionCommandResult,
  ProcessInspectionQuery,
  ProcessInspectionRecord,
  ProcessInspectionStepSummary,
  PageQuery,
  PageResult,
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
const root = '/quality/process-inspections';
const write = <T>(url: string, data: unknown, key: string): Promise<T> =>
  request<T>({
    url,
    method: 'POST',
    data,
    headers: { [IDEMPOTENCY_KEY_HEADER]: key },
    retryIdempotentWrite: true,
    retryTimes: 2,
  });

export const processInspectionsApi = {
  list: (params: ProcessInspectionQuery, signal?: AbortSignal) =>
    request<PageResult<ProcessInspectionStepSummary>>({ url: root, params, signal }),
  step: (stepId: string, signal?: AbortSignal) =>
    request<ProcessInspectionStepSummary>({ url: `${root}/steps/${stepId}`, signal }),
  entries: (stepId: string, params: PageQuery, signal?: AbortSignal) =>
    request<PageResult<ProcessInspectionEntry>>({
      url: `${root}/steps/${stepId}/inspections`,
      params,
      signal,
    }),
  detail: (id: string, signal?: AbortSignal) =>
    request<ProcessInspectionEntry>({ url: `${root}/${id}`, signal }),
  records: (id: string, params: PageQuery, signal?: AbortSignal) =>
    request<PageResult<ProcessInspectionRecord>>({ url: `${root}/${id}/records`, params, signal }),
  create: (data: CreateProcessInspectionPayload, key: string) =>
    write<ProcessInspectionCommandResult>(root, data, key),
  correct: (id: string, data: CorrectProcessInspectionPayload, key: string) =>
    write<ProcessInspectionCommandResult>(`${root}/${id}/actions/correct`, data, key),
  reverse: (id: string, data: ReverseProcessInspectionPayload, key: string) =>
    write<ProcessInspectionCommandResult>(`${root}/${id}/actions/reverse`, data, key),
};
