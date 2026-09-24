import type {
  ProductionExecutionCompletionResult,
  ResearchExecutionStartResult,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

async function execute<T>(
  batchId: string,
  action: 'start' | 'complete',
  version: number,
  key: string,
): Promise<T> {
  try {
    const config: RetryRequestConfig = {
      url: `/production/batches/${batchId}/actions/${action}-research`,
      method: 'POST',
      data: { version },
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      retryIdempotentWrite: true,
      retryTimes: 2,
      skipErrorHandling: true,
    };
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
}

export const productionResearchApi = {
  start: (batchId: string, version: number, key: string) =>
    execute<ResearchExecutionStartResult>(batchId, 'start', version, key),
  complete: (batchId: string, version: number, key: string) =>
    execute<ProductionExecutionCompletionResult>(batchId, 'complete', version, key),
};
