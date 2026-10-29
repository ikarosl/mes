import type {
  ProductionExecutionCompletionResult,
  CompleteProductionExecutionPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request } from './request';

export const productionResearchApi = {
  complete: (
    batchId: string,
    data: CompleteProductionExecutionPayload,
    key: string,
  ): Promise<ProductionExecutionCompletionResult> =>
    request<ProductionExecutionCompletionResult>({
      url: `/production/batches/${batchId}/actions/complete-research`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      skipErrorHandling: true,
    }),
};
