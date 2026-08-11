import type {
  CreateProductionBatchPayload,
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  AvailableItemBatchItem,
  MaterialAllocationCommandResult,
  MaterialOutboundCommandResult,
  MaterialOutboundItem,
  ProductionMaterialAllocationItem,
  ProductionMaterialDemandItem,
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
  WorkOrderOption,
  WorkOrderQuery,
  ProductionStepCommandResult,
  ProductionWorkerTaskItem,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const productionApi = {
  /** 分页查询生产工单 */
  listOrders: (params: WorkOrderQuery) =>
    request<PageResult<WorkOrderItem>>({ url: '/production/work-orders', params }),

  /** 任务表单已下达工单候选（/options 契约）：完整返回全部 released 且仍有余量的工单，前端本地过滤 */
  workOrderOptions: () =>
    request<WorkOrderOption[]>({
      url: '/production/work-orders/options',
      skipErrorHandling: true,
    }),

  /** 获取工单详情（含生产批次） */
  getOrder: (id: string) => request<WorkOrderDetail>({ url: `/production/work-orders/${id}` }),

  /** 创建工单 */
  createOrder: (data: CreateWorkOrderPayload) =>
    request<WorkOrderDetail>({ url: '/production/work-orders', method: 'POST', data }),

  /** 更新工单 */
  updateOrder: (id: string, data: UpdateWorkOrderPayload) =>
    request<WorkOrderDetail>({ url: `/production/work-orders/${id}`, method: 'PATCH', data }),

  /** 工单状态变更 */
  changeOrderStatus: (id: string, action: 'release' | 'cancel' | 'close', version: number) =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/${action}`,
      method: 'POST',
      data: { version },
    }),

  /** 查询工单下的生产批次列表 */
  listOrderBatches: (workOrderId: string) =>
    request<ProductionBatchItem[]>({ url: `/production/work-orders/${workOrderId}/batches` }),

  /** 在工单下创建生产批次（幂等试点端点：键由业务意图 composable 生成并传入，本包装只转发） */
  createOrderBatch: (
    workOrderId: string,
    data: CreateProductionBatchPayload,
    idempotencyKey: string,
  ) =>
    request<ProductionBatchDetail>({
      url: `/production/work-orders/${workOrderId}/batches`,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),

  /** 分页查询生产批次 */
  listBatches: (params: ProductionBatchQuery) =>
    request<PageResult<ProductionBatchItem>>({ url: '/production/batches', params }),

  /** 获取生产批次详情（含工序记录） */
  getBatch: (id: string) => request<ProductionBatchDetail>({ url: `/production/batches/${id}` }),

  /** 更新生产批次 */
  updateBatch: (id: string, data: UpdateProductionBatchPayload) =>
    request<ProductionBatchDetail>({ url: `/production/batches/${id}`, method: 'PATCH', data }),

  updateBatchStepExecution: (
    batchId: string,
    recordId: string,
    data: UpdateBatchStepExecutionPayload,
  ) =>
    request<ProductionBatchDetail>({
      url: `/production/batches/${batchId}/step-records/${recordId}/execution`,
      method: 'PATCH',
      data,
    }),

  /** 生成物料需求 */
  generateMaterialDemands: (batchId: string, version: number) =>
    request<ProductionBatchDetail>({
      url: `/production/batches/${batchId}/actions/generate-material-demands`,
      method: 'POST',
      data: { version },
    }),

  listMaterialDemands: (batchId: string) =>
    request<ProductionMaterialDemandItem[]>({
      url: `/production/batches/${batchId}/material-demands`,
    }),

  listAvailableItemBatches: (demandId: string) =>
    request<AvailableItemBatchItem[]>({
      url: `/production/material-demands/${demandId}/available-item-batches`,
    }),

  createMaterialAllocations: (
    batchId: string,
    data: CreateMaterialAllocationsPayload,
    idempotencyKey: string,
  ) =>
    request<MaterialAllocationCommandResult>({
      url: `/production/batches/${batchId}/material-allocations`,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),

  releaseMaterialAllocation: (batchId: string, allocationId: string, version: number) =>
    request<ProductionMaterialAllocationItem>({
      url: `/production/batches/${batchId}/material-allocations/${allocationId}/actions/release`,
      method: 'POST',
      data: { version },
    }),

  createMaterialOutbound: (
    batchId: string,
    data: CreateMaterialOutboundPayload,
    idempotencyKey: string,
  ) =>
    request<MaterialOutboundCommandResult>({
      url: `/production/batches/${batchId}/material-outbounds`,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),

  listMaterialOutbounds: (batchId: string) =>
    request<MaterialOutboundItem[]>({ url: `/production/batches/${batchId}/material-outbounds` }),

  listWorkerTasks: () => request<ProductionWorkerTaskItem[]>({ url: '/production/worker-tasks' }),

  assignStep: (batchId: string, stepRecordId: string, responsibleUserId: string, version: number) =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/assign`,
      method: 'POST',
      data: { responsibleUserId, version },
    }),

  unassignStep: (batchId: string, stepRecordId: string, version: number) =>
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
  ) =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/reassign`,
      method: 'POST',
      data: { responsibleUserId, version },
    }),

  startStep: (batchId: string, stepRecordId: string, version: number) =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/start`,
      method: 'POST',
      data: { version },
    }),
};
