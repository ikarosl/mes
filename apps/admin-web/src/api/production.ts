import type {
  CreateProductionBatchPayload,
  CreateWorkOrderPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchItem,
  ProductionBatchQuery,
  UpdateProductionBatchPayload,
  UpdateBatchStepExecutionPayload,
  UpdateWorkOrderPayload,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderQuery,
} from '@company/contracts';
import { toRequestError } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: Parameters<typeof httpClient.request<T>>[0]) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

const withIdempotency = <T>(config: Parameters<typeof httpClient.request<T>>[0]) => ({
  ...config,
  headers: { ...config.headers, 'Idempotency-Key': crypto.randomUUID() },
});

export const productionApi = {
  /** 分页查询生产工单 */
  listOrders: (params: WorkOrderQuery) =>
    request<PageResult<WorkOrderItem>>({ url: '/production/work-orders', params }),

  /** 获取工单详情（含生产批次） */
  getOrder: (id: string) => request<WorkOrderDetail>({ url: `/production/work-orders/${id}` }),

  /** 创建工单 */
  createOrder: (data: CreateWorkOrderPayload) =>
    request<WorkOrderDetail>(
      withIdempotency({ url: '/production/work-orders', method: 'POST', data }),
    ),

  /** 更新工单 */
  updateOrder: (id: string, data: UpdateWorkOrderPayload) =>
    request<WorkOrderDetail>(
      withIdempotency({ url: `/production/work-orders/${id}`, method: 'PATCH', data }),
    ),

  /** 工单状态变更 */
  changeOrderStatus: (id: string, action: 'release' | 'cancel' | 'close', version: number) =>
    request<WorkOrderDetail>(
      withIdempotency({
        url: `/production/work-orders/${id}/actions/${action}`,
        method: 'POST',
        data: { version },
      }),
    ),

  /** 查询工单下的生产批次列表 */
  listOrderBatches: (workOrderId: string) =>
    request<ProductionBatchItem[]>({ url: `/production/work-orders/${workOrderId}/batches` }),

  /** 在工单下创建生产批次 */
  createOrderBatch: (workOrderId: string, data: CreateProductionBatchPayload) =>
    request<ProductionBatchDetail>(
      withIdempotency({
        url: `/production/work-orders/${workOrderId}/batches`,
        method: 'POST',
        data,
      }),
    ),

  /** 分页查询生产批次 */
  listBatches: (params: ProductionBatchQuery) =>
    request<PageResult<ProductionBatchItem>>({ url: '/production/batches', params }),

  /** 获取生产批次详情（含工序记录） */
  getBatch: (id: string) => request<ProductionBatchDetail>({ url: `/production/batches/${id}` }),

  /** 更新生产批次 */
  updateBatch: (id: string, data: UpdateProductionBatchPayload) =>
    request<ProductionBatchDetail>(
      withIdempotency({ url: `/production/batches/${id}`, method: 'PATCH', data }),
    ),

  updateBatchStepExecution: (
    batchId: string,
    recordId: string,
    data: UpdateBatchStepExecutionPayload,
  ) =>
    request<ProductionBatchDetail>(
      withIdempotency({
        url: `/production/batches/${batchId}/step-records/${recordId}/execution`,
        method: 'PATCH',
        data,
      }),
    ),

  /** 生成物料需求 */
  generateMaterialDemands: (batchId: string, version: number) =>
    request<ProductionBatchDetail>(
      withIdempotency({
        url: `/production/batches/${batchId}/actions/generate-material-demands`,
        method: 'POST',
        data: { version },
      }),
    ),
};
