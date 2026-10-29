import type {
  PageResult,
  ProductionBatchQuery,
  ProductionStepCommandResult,
  ProductionWorkerTaskItem,
  ProductionWorkerTaskQuery,
  ProductionStepExecutionHistoryItem,
  ReopenProductionStepPayload,
  ProductionExecutionRecordGroup,
  ProductionExecutionCompletionCheck,
  ProductionExecutionCompletionResult,
  CompleteProductionExecutionPayload,
  ProductionExecutionStartCheck,
  StartProductionExecutionPayload,
  ProductionExecutionStartResult,
  ProductionExecutionBatchSummary,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

export const productionExecutionApi = {
  listWorkerTasks: (
    params: ProductionWorkerTaskQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionWorkerTaskItem>> =>
    request<PageResult<ProductionWorkerTaskItem>>({
      ...options,
      url: '/production/worker-tasks',
      params,
    }),

  workerTaskSopContent: (batchId: string, stepRecordId: string): Promise<Blob> =>
    request<Blob>({
      url: `/production/worker-tasks/batches/${batchId}/step-records/${stepRecordId}/sop-content`,
      responseType: 'blob',
      timeout: 0,
    }),

  startStep: (
    batchId: string,
    stepRecordId: string,
    version: number,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/start`,
      method: 'POST',
      data: { version },
    }),

  completeStep: (
    batchId: string,
    stepRecordId: string,
    version: number,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/complete`,
      method: 'POST',
      data: { version },
    }),

  reopenStep: (
    batchId: string,
    stepRecordId: string,
    data: ReopenProductionStepPayload,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/reopen`,
      method: 'POST',
      data,
    }),

  adminStartStep: (
    batchId: string,
    stepRecordId: string,
    version: number,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/admin-start`,
      method: 'POST',
      data: { version },
    }),

  adminCompleteStep: (
    batchId: string,
    stepRecordId: string,
    version: number,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/admin-complete`,
      method: 'POST',
      data: { version },
    }),

  adminReopenStep: (
    batchId: string,
    stepRecordId: string,
    data: ReopenProductionStepPayload,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/admin-reopen`,
      method: 'POST',
      data,
    }),

  listStepExecutionActions: (
    batchId: string,
    stepRecordId: string,
    worker: boolean,
    params: { page: number; pageSize: number },
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionStepExecutionHistoryItem>> =>
    request<PageResult<ProductionStepExecutionHistoryItem>>({
      ...options,
      url: worker
        ? `/production/worker-tasks/batches/${batchId}/step-records/${stepRecordId}/execution-actions`
        : `/production/batches/${batchId}/step-records/${stepRecordId}/execution-actions`,
      params,
    }),

  getBatchExecutionRecords: (
    batchId: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionExecutionRecordGroup> =>
    request<ProductionExecutionRecordGroup>({
      ...options,
      url: `/production/batches/${batchId}/execution-records`,
    }),

  listExecutionBatchSummaries: (
    params: ProductionBatchQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionExecutionBatchSummary>> =>
    request<PageResult<ProductionExecutionBatchSummary>>({
      ...options,
      url: '/production/execution-batches',
      params,
    }),

  getExecutionCompletionCheck: (
    batchId: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionExecutionCompletionCheck> =>
    request<ProductionExecutionCompletionCheck>({
      ...options,
      url: `/production/batches/${batchId}/execution-completion-check`,
    }),

  getExecutionStartCheck: (
    batchId: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionExecutionStartCheck> =>
    request<ProductionExecutionStartCheck>({
      ...options,
      url: `/production/batches/${batchId}/execution-start-check`,
    }),

  startProductionExecution: (
    batchId: string,
    data: StartProductionExecutionPayload,
    idempotencyKey: string,
  ): Promise<ProductionExecutionStartResult> =>
    request<ProductionExecutionStartResult>({
      url: `/production/batches/${batchId}/actions/start-execution`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

  completeProductionExecution: (
    batchId: string,
    data: CompleteProductionExecutionPayload,
    idempotencyKey: string,
  ): Promise<ProductionExecutionCompletionResult> =>
    request<ProductionExecutionCompletionResult>({
      url: `/production/batches/${batchId}/actions/complete-execution`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
};
