import type {
  ProductionExecutionCompletionResult,
  CompleteProductionExecutionPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

async function execute<T>(
  batchId: string,
  data: CompleteProductionExecutionPayload,
  key: string,
): Promise<T> {
  try {
    const config: RetryRequestConfig = {
      url: `/production/batches/${batchId}/actions/complete-research`,
      method: 'POST',
      data,
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
  complete: (batchId: string, data: CompleteProductionExecutionPayload, key: string) =>
    execute<ProductionExecutionCompletionResult>(batchId, data, key),
};
