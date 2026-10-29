import type {
  CreateProductionBatchPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchStartRecord,
  ProductionBatchStepRecords,
  ProductionBatchCancellationCheck,
  ProductionBatchItem,
  ProductionBatchQuery,
  UpdateProductionBatchPayload,
  UpdateBatchStepExecutionPayload,
  ProductionStepCommandResult,
  CancelProductionBatchPayload,
  UserOption,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

export const productionTasksApi = {
  taskOwnerOptions: (signal?: AbortSignal): Promise<UserOption[]> =>
    request<UserOption[]>({
      url: '/production/batches/owner-options',
      signal,
      skipErrorHandling: true,
    }),

  /** 在工单下创建生产批次（幂等试点端点：键由业务意图 composable 生成并传入，本包装只转发） */
  createOrderBatch: (
    workOrderId: string,
    data: CreateProductionBatchPayload,
    idempotencyKey: string,
  ): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({
      url: `/production/work-orders/${workOrderId}/batches`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  /** 分页查询生产批次 */
  listBatches: (params: ProductionBatchQuery): Promise<PageResult<ProductionBatchItem>> =>
    request<PageResult<ProductionBatchItem>>({ url: '/production/batches', params }),

  /** 获取生产任务轻量详情 */
  getBatch: (id: string, options: ReadRequestOptions = {}): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({ ...options, url: `/production/batches/${id}` }),

  getBatchStartRecord: (
    id: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionBatchStartRecord | null> =>
    request<ProductionBatchStartRecord | null>({
      ...options,
      url: `/production/batches/${id}/start-record`,
    }),

  getBatchStepRecords: (
    id: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionBatchStepRecords> =>
    request<ProductionBatchStepRecords>({
      ...options,
      url: `/production/batches/${id}/step-records`,
    }),

  /** 取消任务前读取服务端实时影响摘要；提交时后端仍会再次校验。 */
  getBatchCancellationCheck: (id: string): Promise<ProductionBatchCancellationCheck> =>
    request<ProductionBatchCancellationCheck>({
      url: `/production/batches/${id}/cancellation-check`,
    }),

  /** 更新生产批次 */
  updateBatch: (id: string, data: UpdateProductionBatchPayload): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({ url: `/production/batches/${id}`, method: 'PATCH', data }),

  updateBatchStepExecution: (
    batchId: string,
    recordId: string,
    data: UpdateBatchStepExecutionPayload,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${recordId}/execution`,
      method: 'PATCH',
      data,
    }),

  cancelBatch: (id: string, data: CancelProductionBatchPayload): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({
      url: `/production/batches/${id}/actions/cancel`,
      method: 'POST',
      data,
    }),

  assignStep: (
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/assign`,
      method: 'POST',
      data: { responsibleUserId, version },
    }),

  unassignStep: (
    batchId: string,
    stepRecordId: string,
    version: number,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/unassign`,
      method: 'POST',
      data: { version },
    }),

  reassignStep: (
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
  ): Promise<ProductionStepCommandResult> =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/reassign`,
      method: 'POST',
      data: { responsibleUserId, version },
    }),
};
