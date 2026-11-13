import type {
  CreateProductionBatchPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchCancellationCheck,
  ProductionBatchItem,
  ProductionBatchQuery,
  UpdateProductionBatchPayload,
  ReleaseProductionBatchPayload,
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
  listBatches: (
    params: ProductionBatchQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionBatchItem>> =>
    request<PageResult<ProductionBatchItem>>({ ...options, url: '/production/batches', params }),

  /** 获取生产任务轻量详情 */
  getBatch: (id: string, options: ReadRequestOptions = {}): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({ ...options, url: `/production/batches/${id}` }),

  /** 取消任务前读取服务端实时影响摘要；提交时后端仍会再次校验。 */
  getBatchCancellationCheck: (id: string): Promise<ProductionBatchCancellationCheck> =>
    request<ProductionBatchCancellationCheck>({
      url: `/production/batches/${id}/cancellation-check`,
    }),

  /** 更新生产批次 */
  updateBatch: (id: string, data: UpdateProductionBatchPayload): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({ url: `/production/batches/${id}`, method: 'PATCH', data }),

  releaseBatch: (
    id: string,
    data: ReleaseProductionBatchPayload,
    idempotencyKey: string,
  ): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({
      url: `/production/batches/${id}/actions/release`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  cancelBatch: (id: string, data: CancelProductionBatchPayload): Promise<ProductionBatchDetail> =>
    request<ProductionBatchDetail>({
      url: `/production/batches/${id}/actions/cancel`,
      method: 'POST',
      data,
    }),
};
