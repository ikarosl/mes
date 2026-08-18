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
  CloseWorkOrderPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchCancellationCheck,
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
  BatchStepReportCommandResult,
  CorrectBatchStepReportCommandResult,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  ProductionExecutionRecordGroup,
  ProductionExecutionCompletionCheck,
  ProductionExecutionCompletionResult,
  ProductionExecutionBatchSummary,
  ReverseBatchStepReportPayload,
  ProductionTraceWorkOrderGroup,
  ProductionTraceDetail,
  ApproveScrapSupplementPayload,
  ApproveScrapSupplementResult,
  ProductionSupplementCandidateItem,
  ProductionTraceQuery,
  MaterialOutboundQuery,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  CreatePurchaseInboundPayload,
  InventoryBatchItem,
  InventoryBatchQuery,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
  ApproveBatchStepReworkPayload,
  BatchStepAbnormalDispositionItem,
  CompleteReworkPayload,
  CompleteReworkResult,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
  CancelProductionBatchPayload,
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
  listPurchaseInbounds: (params: PurchaseInboundOrderQuery) =>
    request<PageResult<PurchaseInboundOrderItem>>({ url: '/production/purchase-inbounds', params }),
  getPurchaseInbound: (id: string) =>
    request<PurchaseInboundOrderItem>({ url: `/production/purchase-inbounds/${id}` }),
  createPurchaseInbound: (data: CreatePurchaseInboundPayload, idempotencyKey: string) =>
    request<PurchaseInboundOrderItem>({
      url: '/production/purchase-inbounds',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),
  confirmPurchaseInbound: (id: string, version: number, idempotencyKey: string) =>
    request<PurchaseInboundOrderItem>({
      url: `/production/purchase-inbounds/${id}/actions/confirm`,
      method: 'POST',
      data: { version },
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),
  cancelPurchaseInbound: (id: string, version: number) =>
    request<PurchaseInboundOrderItem>({
      url: `/production/purchase-inbounds/${id}/actions/cancel`,
      method: 'POST',
      data: { version },
    }),
  listInventoryBatches: (params: InventoryBatchQuery) =>
    request<PageResult<InventoryBatchItem>>({ url: '/production/inventory-batches', params }),
  getInventoryBatch: (id: string) =>
    request<InventoryBatchItem>({ url: `/production/inventory-batches/${id}` }),
  searchProductionTrace: (params: ProductionTraceQuery) =>
    request<PageResult<ProductionTraceWorkOrderGroup>>({ url: '/production/trace', params }),

  getProductionTrace: (batchId: string) =>
    request<ProductionTraceDetail>({ url: `/production/trace/batches/${batchId}` }),

  /** 分页查询生产工单 */
  listOrders: (params: WorkOrderQuery) =>
    request<PageResult<WorkOrderItem>>({ url: '/production/work-orders', params }),

  /** 任务表单工单候选：完整返回 released/doing 且仍有余量的工单，前端本地过滤 */
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

  /** 下达草稿工单 */
  releaseOrder: (id: string, version: number) =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/release`,
      method: 'POST',
      data: { version },
    }),

  /** 取消尚未下达的草稿工单 */
  cancelOrder: (id: string, version: number) =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/cancel`,
      method: 'POST',
      data: { version },
    }),

  /** 管理员显式确认工单足量完工 */
  completeOrder: (id: string, version: number) =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/complete`,
      method: 'POST',
      data: { version },
    }),

  /** 提前结案或完工后行政归档 */
  closeOrder: (id: string, data: CloseWorkOrderPayload) =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/close`,
      method: 'POST',
      data,
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

  /** 取消任务前读取服务端实时影响摘要；提交时后端仍会再次校验。 */
  getBatchCancellationCheck: (id: string) =>
    request<ProductionBatchCancellationCheck>({
      url: `/production/batches/${id}/cancellation-check`,
    }),

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

  cancelBatch: (id: string, data: CancelProductionBatchPayload) =>
    request<ProductionBatchDetail>({
      url: `/production/batches/${id}/actions/cancel`,
      method: 'POST',
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

  listMaterialOutboundOrders: (params: MaterialOutboundQuery) =>
    request<PageResult<MaterialOutboundItem>>({ url: '/production/material-outbounds', params }),

  getMaterialOutbound: (outboundId: string) =>
    request<MaterialOutboundItem>({ url: `/production/material-outbounds/${outboundId}` }),

  listMaterialOutboundBatchOptions: () =>
    request<MaterialOutboundBatchOption[]>({
      url: '/production/material-outbounds/batch-options',
      skipErrorHandling: true,
    }),

  listMaterialOutboundCandidates: (batchId: string) =>
    request<MaterialOutboundCandidateItem[]>({
      url: `/production/batches/${batchId}/material-outbound-candidates`,
    }),

  confirmMaterialOutbound: (outboundId: string, version: number, idempotencyKey: string) =>
    request<MaterialOutboundCommandResult>({
      url: `/production/material-outbounds/${outboundId}/actions/confirm`,
      method: 'POST',
      data: { version },
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),

  cancelMaterialOutbound: (outboundId: string, version: number) =>
    request<MaterialOutboundItem>({
      url: `/production/material-outbounds/${outboundId}/actions/cancel`,
      method: 'POST',
      data: { version },
    }),

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

  completeStep: (batchId: string, stepRecordId: string, version: number) =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/complete`,
      method: 'POST',
      data: { version },
    }),

  getBatchExecutionRecords: (batchId: string) =>
    request<ProductionExecutionRecordGroup>({
      url: `/production/batches/${batchId}/execution-records`,
    }),

  listExecutionBatchSummaries: (params: ProductionBatchQuery) =>
    request<PageResult<ProductionExecutionBatchSummary>>({
      url: '/production/execution-batches',
      params,
    }),

  getExecutionCompletionCheck: (batchId: string) =>
    request<ProductionExecutionCompletionCheck>({
      url: `/production/batches/${batchId}/execution-completion-check`,
    }),

  completeProductionExecution: (batchId: string, version: number) =>
    request<ProductionExecutionCompletionResult>({
      url: `/production/batches/${batchId}/actions/complete-execution`,
      method: 'POST',
      data: { version },
    }),

  createStepReport: (
    batchId: string,
    stepRecordId: string,
    data: CreateBatchStepReportPayload,
    idempotencyKey: string,
  ) =>
    request<BatchStepReportCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/reports`,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),

  reverseStepReport: (
    batchId: string,
    stepRecordId: string,
    reportId: string,
    data: ReverseBatchStepReportPayload,
  ) =>
    request<BatchStepReportCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/reports/${reportId}/actions/reverse`,
      method: 'POST',
      data,
    }),

  correctStepReport: (
    batchId: string,
    stepRecordId: string,
    reportId: string,
    data: CorrectBatchStepReportPayload,
    idempotencyKey: string,
  ) =>
    request<CorrectBatchStepReportCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/reports/${reportId}/actions/correct`,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),

  listBatchReworks: (batchId: string) =>
    request<ReworkRecordItem[]>({ url: `/production/batches/${batchId}/reworks` }),

  approveDispositionRework: (dispositionId: string, data: ApproveBatchStepReworkPayload) =>
    request<ReworkRecordItem>({
      url: `/production/abnormal-dispositions/${dispositionId}/actions/approve-rework`,
      method: 'POST',
      data,
    }),

  rejectAbnormalDisposition: (
    dispositionId: string,
    data: RejectBatchStepAbnormalDispositionPayload,
  ) =>
    request<BatchStepAbnormalDispositionItem>({
      url: `/production/abnormal-dispositions/${dispositionId}/actions/reject`,
      method: 'POST',
      data,
    }),

  startRework: (reworkId: string, version: number) =>
    request<ReworkRecordItem>({
      url: `/production/reworks/${reworkId}/actions/start`,
      method: 'POST',
      data: { version },
    }),

  completeRework: (reworkId: string, data: CompleteReworkPayload, idempotencyKey: string) =>
    request<CompleteReworkResult>({
      url: `/production/reworks/${reworkId}/actions/complete`,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),

  listSupplementCandidates: (dispositionId: string) =>
    request<ProductionSupplementCandidateItem[]>({
      url: `/production/abnormal-dispositions/${dispositionId}/supplement-candidates`,
    }),

  approveScrapSupplement: (
    dispositionId: string,
    data: ApproveScrapSupplementPayload,
    idempotencyKey: string,
  ) =>
    request<ApproveScrapSupplementResult>({
      url: `/production/abnormal-dispositions/${dispositionId}/actions/approve-scrap-supplement`,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      retryUnsafe: true,
      retryTimes: 2,
    }),
};
