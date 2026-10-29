import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderItem,
  FinishedGoodsInboundOrderDetail,
  ConfirmFinishedGoodsInboundPayload,
  FinishedGoodsInboundCommandResult,
  BatchTerminationCheck,
  DemandCorrectionCheck,
  DemandCorrectionHistoryItem,
  SubmitDemandCorrectionPayload,
  ProductionApprovalResult,
  BatchCloseoutDetail,
  BatchCloseoutCommandResult,
  BatchCloseoutWithdrawalCheck,
  WithdrawBatchCloseoutPayload,
  WithdrawBatchCloseoutResult,
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  RecordCloseoutMaterialLossPayload,
  RecordCloseoutMaterialLossResult,
  ProductionOutputDetail,
  SaveProductionOutputPayload,
  ReviewProductionOutputMaterialPayload,
  SubmitProductionOutputPayload,
  BeginProductionOutputCorrectionPayload,
  ProductionOutputCommandResult,
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
  CancelWorkOrderPayload,
  CloseWorkOrderPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchStartRecord,
  ProductionBatchStepRecords,
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
  ProductionWorkerTaskQuery,
  BatchStepReportCommandResult,
  BatchStepReportView,
  BatchStepReportDetail,
  BatchStepScrapRecordView,
  BatchReverseStepReportsPreview,
  BatchReverseStepReportsCommandResult,
  PreviewBatchReverseStepReportsPayload,
  BatchReverseStepReportsPayload,
  HistoricalBatchStepReportPayload,
  ProductionStepExecutionHistoryItem,
  ReopenProductionStepPayload,
  CorrectBatchStepReportCommandResult,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  ProductionExecutionRecordGroup,
  ProductionExecutionCompletionCheck,
  ProductionExecutionCompletionResult,
  CompleteProductionExecutionPayload,
  ProductionExecutionStartCheck,
  StartProductionExecutionPayload,
  ProductionExecutionStartResult,
  ProductionExecutionBatchSummary,
  ReverseBatchStepReportPayload,
  ProductionTraceWorkOrderGroup,
  ProductionTraceDetail,
  ApproveScrapSupplementResult,
  ProductionSupplementCandidateItem,
  ProductionScrapSupplementPlanItem,
  SaveProductionScrapSupplementPlanPayload,
  ConfirmProductionScrapSupplementPlanPayload,
  ProductionTraceQuery,
  MaterialOutboundQuery,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  CancelMaterialOutboundPayload,
  InventoryBatchDetailItem,
  InventoryBatchItem,
  InventoryBatchQuery,
  InventoryMaterialSupplyDemandItem,
  InventoryMaterialSupplyDemandQuery,
  InventoryMaterialDemandTraceItem,
  InventoryMaterialDemandTraceQuery,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
  ApproveBatchStepReworkPayload,
  BatchStepAbnormalDispositionItem,
  CompleteReworkPayload,
  CompleteReworkResult,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
  ReworkRecordView,
  CancelProductionBatchPayload,
  MaterialDemandManagementPage,
  MaterialOption,
  ProductionMaterialOptionsQuery,
  MaterialDemandManagementQuery,
  ConfigureMaterialDemandsPayload,
  AddManualMaterialDemandsPayload,
  AddManualMaterialDemandsResult,
  UserOption,
} from '@company/contracts';
import {
  IDEMPOTENCY_KEY_HEADER,
  RequestError,
  toRequestError,
  type RetryRequestConfig,
} from '@company/request';
import { httpClient } from './http';

interface ReadRequestOptions {
  skipErrorHandling?: boolean;
  signal?: AbortSignal;
}

const request = async <T>(config: RetryRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const productionApi = {
  productionMaterialOptions: (params: ProductionMaterialOptionsQuery) =>
    request<MaterialOption[]>({
      url: '/production/material-demands/material-options',
      params,
      skipErrorHandling: true,
    }),
  listFinishedGoodsInbounds: (params: FinishedGoodsInboundQuery) =>
    request<PageResult<FinishedGoodsInboundOrderItem>>({
      url: '/production/finished-goods-inbounds',
      params,
      skipErrorHandling: true,
    }),
  finishedGoodsInboundCandidates: (params: FinishedGoodsInboundCandidateQuery) =>
    request<PageResult<FinishedGoodsInboundCandidate>>({
      url: '/production/finished-goods-inbounds/candidates',
      params,
      skipErrorHandling: true,
    }),
  getFinishedGoodsInbound: (id: string) =>
    request<FinishedGoodsInboundOrderDetail>({
      url: `/production/finished-goods-inbounds/${id}`,
      skipErrorHandling: true,
    }),
  confirmFinishedGoodsInbound: (data: ConfirmFinishedGoodsInboundPayload, idempotencyKey: string) =>
    request<FinishedGoodsInboundCommandResult>({
      url: '/production/finished-goods-inbounds/actions/confirm',
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  listPurchaseInbounds: (params: PurchaseInboundOrderQuery, signal?: AbortSignal) =>
    request<PageResult<PurchaseInboundOrderItem>>({
      url: '/production/purchase-inbounds',
      params,
      signal,
      skipErrorHandling: true,
    }),
  getPurchaseInbound: (id: string, signal?: AbortSignal) =>
    request<PurchaseInboundOrderItem>({
      url: `/production/purchase-inbounds/${id}`,
      signal,
      skipErrorHandling: true,
    }),
  listInventoryBatches: (params: InventoryBatchQuery, signal?: AbortSignal) =>
    request<PageResult<InventoryBatchItem>>({
      url: '/production/inventory-batches',
      params,
      signal,
      skipErrorHandling: true,
    }),
  listInventoryMaterialSupplyDemand: (params: InventoryMaterialSupplyDemandQuery) =>
    request<PageResult<InventoryMaterialSupplyDemandItem>>({
      url: '/production/inventory-material-supply-demand',
      params,
    }),
  listInventoryMaterialDemandTrace: (itemId: string, params: InventoryMaterialDemandTraceQuery) =>
    request<PageResult<InventoryMaterialDemandTraceItem>>({
      url: `/production/inventory-material-supply-demand/${itemId}/demands`,
      params,
    }),
  getInventoryBatch: (id: string, signal?: AbortSignal) =>
    request<InventoryBatchDetailItem>({
      url: `/production/inventory-batches/${id}`,
      signal,
      skipErrorHandling: true,
    }),
  searchProductionTrace: (params: ProductionTraceQuery, options: ReadRequestOptions = {}) =>
    request<PageResult<ProductionTraceWorkOrderGroup>>({
      ...options,
      url: '/production/trace',
      params,
    }),

  getProductionTrace: (batchId: string, options: ReadRequestOptions = {}) =>
    request<ProductionTraceDetail>({ ...options, url: `/production/trace/batches/${batchId}` }),

  /** 分页查询生产工单 */
  listOrders: (params: WorkOrderQuery) =>
    request<PageResult<WorkOrderItem>>({ url: '/production/work-orders', params }),

  workOrderOwnerOptions: (signal?: AbortSignal) =>
    request<UserOption[]>({
      url: '/production/work-orders/owner-options',
      signal,
      skipErrorHandling: true,
    }),

  taskOwnerOptions: (signal?: AbortSignal) =>
    request<UserOption[]>({
      url: '/production/batches/owner-options',
      signal,
      skipErrorHandling: true,
    }),

  /** 任务表单工单候选：完整返回 released/doing 且仍有余量的工单，前端本地过滤 */
  workOrderOptions: () =>
    request<WorkOrderOption[]>({
      url: '/production/work-orders/options',
      skipErrorHandling: true,
    }),

  /** 获取工单详情（含生产批次） */
  getOrder: (id: string) => request<WorkOrderDetail>({ url: `/production/work-orders/${id}` }),

  /** 创建工单 */
  createOrder: (data: CreateWorkOrderPayload, idempotencyKey: string) =>
    request<WorkOrderDetail>({
      url: '/production/work-orders',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorHandling: true,
    }),

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
  cancelOrder: (id: string, data: CancelWorkOrderPayload) =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/cancel`,
      method: 'POST',
      data,
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
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  /** 分页查询生产批次 */
  listBatches: (params: ProductionBatchQuery) =>
    request<PageResult<ProductionBatchItem>>({ url: '/production/batches', params }),

  /** 获取生产任务轻量详情 */
  getBatch: (id: string, options: ReadRequestOptions = {}) =>
    request<ProductionBatchDetail>({ ...options, url: `/production/batches/${id}` }),

  getBatchStartRecord: (id: string, options: ReadRequestOptions = {}) =>
    request<ProductionBatchStartRecord | null>({
      ...options,
      url: `/production/batches/${id}/start-record`,
    }),

  getBatchStepRecords: (id: string, options: ReadRequestOptions = {}) =>
    request<ProductionBatchStepRecords>({
      ...options,
      url: `/production/batches/${id}/step-records`,
    }),

  getBatchTerminationCheck: (id: string) =>
    request<BatchTerminationCheck>({
      url: `/production/batches/${id}/termination-check`,
      skipErrorHandling: true,
    }),

  getDemandCorrectionCheck: (id: string, options: ReadRequestOptions = {}) =>
    request<DemandCorrectionCheck>({
      url: `/production/material-demands/${id}/correction-check`,
      skipErrorHandling: true,
      ...options,
    }),
  getDemandCorrectionHistory: (id: string, options: ReadRequestOptions = {}) =>
    request<DemandCorrectionHistoryItem[]>({
      url: `/production/material-demands/${id}/corrections`,
      skipErrorHandling: true,
      ...options,
    }),
  getBatchCloseout: (id: string) =>
    request<BatchCloseoutDetail | null>({
      url: `/production/batches/${id}/closeout`,
      skipErrorHandling: true,
    }),
  getCloseoutWithdrawalCheck: (batchId: string, options: ReadRequestOptions = {}) =>
    request<BatchCloseoutWithdrawalCheck>({
      ...options,
      url: `/production/batches/${batchId}/closeout/withdraw-check`,
    }),
  withdrawBatchCloseout: (
    batchId: string,
    data: WithdrawBatchCloseoutPayload,
    idempotencyKey: string,
  ) =>
    request<WithdrawBatchCloseoutResult>({
      url: `/production/batches/${batchId}/closeout/withdraw`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  submitDemandCorrection: (
    id: string,
    data: SubmitDemandCorrectionPayload,
    idempotencyKey: string,
  ) =>
    request<ProductionApprovalResult>({
      url: `/production/material-demands/${id}/corrections`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  beginBatchCloseout: (id: string, data: BeginBatchCloseoutPayload, idempotencyKey: string) =>
    request<BatchCloseoutCommandResult>({
      url: `/production/batches/${id}/closeout/begin`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  handleBatchCloseoutItem: (
    id: string,
    data: HandleBatchCloseoutItemPayload,
    idempotencyKey: string,
  ) =>
    request<BatchCloseoutCommandResult>({
      url: `/production/batches/${id}/closeout/items`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  getProductionOutput: (id: string) =>
    request<ProductionOutputDetail>({
      url: `/production/batches/${id}/output`,
      skipErrorHandling: true,
    }),
  recordCloseoutMaterialLoss: (
    id: string,
    data: RecordCloseoutMaterialLossPayload,
    idempotencyKey: string,
  ) =>
    request<RecordCloseoutMaterialLossResult>({
      url: `/production/batches/${id}/closeout/material-losses`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  reviewProductionOutputMaterial: (
    id: string,
    data: ReviewProductionOutputMaterialPayload,
    idempotencyKey: string,
  ) =>
    request<ProductionOutputCommandResult>({
      url: `/production/batches/${id}/output/material-review`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  saveProductionOutput: (id: string, data: SaveProductionOutputPayload, idempotencyKey: string) =>
    request<ProductionOutputCommandResult>({
      url: `/production/batches/${id}/output/draft`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  submitProductionOutput: (
    id: string,
    data: SubmitProductionOutputPayload,
    idempotencyKey: string,
  ) =>
    request<ProductionApprovalResult>({
      url: `/production/batches/${id}/output/submit`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  beginProductionOutputCorrection: (
    id: string,
    data: BeginProductionOutputCorrectionPayload,
    idempotencyKey: string,
  ) =>
    request<ProductionOutputCommandResult>({
      url: `/production/batches/${id}/output/corrections`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
  cancelProductionOutputCorrection: (id: string, version: number, idempotencyKey: string) =>
    request<ProductionOutputCommandResult>({
      url: `/production/batches/${id}/output/corrections/cancel`,
      method: 'POST',
      data: { version },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
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
    request<ProductionStepCommandResult>({
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

  listMaterialDemands: (batchId: string, options: ReadRequestOptions = {}) =>
    request<ProductionMaterialDemandItem[]>({
      ...options,
      url: `/production/batches/${batchId}/material-demands`,
    }),

  /**
   * Cross-batch administrator view. Normal demand is configured explicitly by
   * base BOM line; this endpoint must return every enabled variant, but must not
   * query or display inventory and must not auto-select a version on the client's behalf.
   */
  listMaterialDemandManagement: (params: MaterialDemandManagementQuery) =>
    request<MaterialDemandManagementPage>({ url: '/production/material-demands', params }),
  configureMaterialDemands: async (
    batchId: string,
    data: ConfigureMaterialDemandsPayload,
    idempotencyKey: string,
  ) => {
    const result = await request<{ configured: true }>({
      url: `/production/batches/${batchId}/material-demands/configurations`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    });
    if (result?.configured !== true)
      throw new RequestError('服务器未返回完整的需求配置结果，请重试本次操作以核对结果。', 502);
    return result;
  },
  addManualMaterialDemands: async (
    batchId: string,
    data: AddManualMaterialDemandsPayload,
    idempotencyKey: string,
  ) => {
    const result = await request<AddManualMaterialDemandsResult>({
      url: `/production/batches/${batchId}/material-demands/additions`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    });
    const expectedCount = data.requirements.reduce(
      (count, requirement) => count + requirement.splits.length,
      0,
    );
    if (
      !result ||
      !/^[1-9]\d*$/.test(result.additionId) ||
      typeof result.additionNo !== 'string' ||
      !result.additionNo.trim() ||
      !Array.isArray(result.demandIds) ||
      result.demandIds.length !== expectedCount ||
      result.demandIds.some((id) => typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) ||
      new Set(result.demandIds).size !== result.demandIds.length
    )
      throw new RequestError('服务器未返回完整的手工需求结果，请重试本次操作以核对结果。', 502);
    return result;
  },

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
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  releaseMaterialAllocation: (batchId: string, allocationId: string, version: number) =>
    request<ProductionMaterialAllocationItem>({
      url: `/production/batches/${batchId}/material-allocations/${allocationId}/actions/release`,
      method: 'POST',
      data: { version },
    }),

  createMaterialOutbound: async (
    batchId: string,
    data: CreateMaterialOutboundPayload,
    idempotencyKey: string,
  ) => {
    const result = await request<MaterialOutboundCommandResult>({
      url: `/production/batches/${batchId}/material-outbounds`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    });
    if (
      !result?.outbound ||
      result.outbound.productionBatchId !== batchId ||
      !/^[1-9]\d*$/.test(result.outbound.outboundId) ||
      result.outbound.status !== 'pending_picking' ||
      !Array.isArray(result.outbound.details) ||
      result.outbound.details.length !== data.details.length
    )
      throw new RequestError('服务器未返回完整的制单结果，请重试原操作以核对结果。', 502);
    return result;
  },

  listMaterialOutbounds: (batchId: string) =>
    request<MaterialOutboundItem[]>({ url: `/production/batches/${batchId}/material-outbounds` }),

  listMaterialOutboundOrders: (params: MaterialOutboundQuery, signal?: AbortSignal) =>
    request<PageResult<MaterialOutboundItem>>({
      url: '/production/material-outbounds',
      params,
      signal,
      skipErrorHandling: true,
    }),

  getMaterialOutbound: (outboundId: string, signal?: AbortSignal) =>
    request<MaterialOutboundItem>({
      url: `/production/material-outbounds/${outboundId}`,
      signal,
      skipErrorHandling: true,
    }),

  listMaterialOutboundBatchOptions: (signal?: AbortSignal) =>
    request<MaterialOutboundBatchOption[]>({
      url: '/production/material-outbounds/batch-options',
      signal,
      skipErrorHandling: true,
    }),

  listMaterialOutboundCandidates: (batchId: string, signal?: AbortSignal) =>
    request<MaterialOutboundCandidateItem[]>({
      url: `/production/batches/${batchId}/material-outbound-candidates`,
      signal,
      skipErrorHandling: true,
    }),

  confirmMaterialOutbound: (outboundId: string, version: number, idempotencyKey: string) =>
    request<MaterialOutboundCommandResult>({
      url: `/production/material-outbounds/${outboundId}/actions/confirm`,
      method: 'POST',
      data: { version },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  cancelMaterialOutbound: (outboundId: string, data: CancelMaterialOutboundPayload) =>
    request<MaterialOutboundItem>({
      url: `/production/material-outbounds/${outboundId}/actions/cancel`,
      method: 'POST',
      data,
    }),

  listWorkerTasks: (params: ProductionWorkerTaskQuery, options: ReadRequestOptions = {}) =>
    request<PageResult<ProductionWorkerTaskItem>>({
      ...options,
      url: '/production/worker-tasks',
      params,
    }),

  workerTaskSopContent: (batchId: string, stepRecordId: string) =>
    request<Blob>({
      url: `/production/worker-tasks/batches/${batchId}/step-records/${stepRecordId}/sop-content`,
      responseType: 'blob',
      timeout: 0,
    }),

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

  reopenStep: (batchId: string, stepRecordId: string, data: ReopenProductionStepPayload) =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/reopen`,
      method: 'POST',
      data,
    }),

  adminStartStep: (batchId: string, stepRecordId: string, version: number) =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/admin-start`,
      method: 'POST',
      data: { version },
    }),

  adminCompleteStep: (batchId: string, stepRecordId: string, version: number) =>
    request<ProductionStepCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/actions/admin-complete`,
      method: 'POST',
      data: { version },
    }),

  adminReopenStep: (batchId: string, stepRecordId: string, data: ReopenProductionStepPayload) =>
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
  ) =>
    request<PageResult<ProductionStepExecutionHistoryItem>>({
      ...options,
      url: worker
        ? `/production/worker-tasks/batches/${batchId}/step-records/${stepRecordId}/execution-actions`
        : `/production/batches/${batchId}/step-records/${stepRecordId}/execution-actions`,
      params,
    }),

  getBatchExecutionRecords: (batchId: string, options: ReadRequestOptions = {}) =>
    request<ProductionExecutionRecordGroup>({
      ...options,
      url: `/production/batches/${batchId}/execution-records`,
    }),

  listStepReports: (
    batchId: string,
    stepRecordId: string,
    params: { page: number; pageSize: number },
    options: ReadRequestOptions = {},
  ) =>
    request<PageResult<BatchStepReportView>>({
      ...options,
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/reports`,
      params,
    }),

  getStepReportDetail: (
    batchId: string,
    stepRecordId: string,
    reportId: string,
    options: ReadRequestOptions = {},
  ) =>
    request<BatchStepReportDetail>({
      ...options,
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/reports/${reportId}`,
    }),

  listStepScrapRecords: (
    batchId: string,
    stepRecordId: string,
    params: { page: number; pageSize: number },
    options: ReadRequestOptions = {},
  ) =>
    request<PageResult<BatchStepScrapRecordView>>({
      ...options,
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/scrap-records`,
      params,
    }),

  listExecutionBatchSummaries: (params: ProductionBatchQuery, options: ReadRequestOptions = {}) =>
    request<PageResult<ProductionExecutionBatchSummary>>({
      ...options,
      url: '/production/execution-batches',
      params,
    }),

  getExecutionCompletionCheck: (batchId: string, options: ReadRequestOptions = {}) =>
    request<ProductionExecutionCompletionCheck>({
      ...options,
      url: `/production/batches/${batchId}/execution-completion-check`,
    }),

  getExecutionStartCheck: (batchId: string, options: ReadRequestOptions = {}) =>
    request<ProductionExecutionStartCheck>({
      ...options,
      url: `/production/batches/${batchId}/execution-start-check`,
    }),

  startProductionExecution: (
    batchId: string,
    data: StartProductionExecutionPayload,
    idempotencyKey: string,
  ) =>
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
  ) =>
    request<ProductionExecutionCompletionResult>({
      url: `/production/batches/${batchId}/actions/complete-execution`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
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
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
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
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  createHistoricalStepReport: (
    batchId: string,
    stepRecordId: string,
    data: HistoricalBatchStepReportPayload,
    idempotencyKey: string,
  ) =>
    request<BatchStepReportCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/historical-reports`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  reverseHistoricalStepReport: (
    batchId: string,
    stepRecordId: string,
    reportId: string,
    data: ReverseBatchStepReportPayload,
  ) =>
    request<BatchStepReportCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/historical-reports/${reportId}/actions/reverse`,
      method: 'POST',
      data,
    }),

  correctHistoricalStepReport: (
    batchId: string,
    stepRecordId: string,
    reportId: string,
    data: HistoricalBatchStepReportPayload,
    idempotencyKey: string,
  ) =>
    request<CorrectBatchStepReportCommandResult>({
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/historical-reports/${reportId}/actions/correct`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  previewBatchReverseStepReports: (
    batchId: string,
    data: PreviewBatchReverseStepReportsPayload,
    options: ReadRequestOptions = {},
  ) =>
    request<BatchReverseStepReportsPreview>({
      ...options,
      url: `/production/batches/${batchId}/step-reports/actions/preview-reverse`,
      method: 'POST',
      data,
    }),

  batchReverseStepReports: (
    batchId: string,
    data: BatchReverseStepReportsPayload,
    idempotencyKey: string,
  ) =>
    request<BatchReverseStepReportsCommandResult>({
      url: `/production/batches/${batchId}/step-reports/actions/reverse`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

  listBatchReworks: (batchId: string, options: ReadRequestOptions = {}) =>
    request<ReworkRecordView[]>({ ...options, url: `/production/batches/${batchId}/reworks` }),

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
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  listSupplementCandidates: (dispositionId: string) =>
    request<ProductionSupplementCandidateItem[]>({
      url: `/production/abnormal-dispositions/${dispositionId}/supplement-candidates`,
    }),

  getScrapSupplementPlan: (dispositionId: string) =>
    request<ProductionScrapSupplementPlanItem | null>({
      url: `/production/abnormal-dispositions/${dispositionId}/scrap-supplement-plan`,
    }),

  saveScrapSupplementPlan: (
    dispositionId: string,
    data: SaveProductionScrapSupplementPlanPayload,
  ) =>
    request<ProductionScrapSupplementPlanItem>({
      url: `/production/abnormal-dispositions/${dispositionId}/scrap-supplement-plan`,
      method: 'PUT',
      data,
    }),

  confirmScrapSupplementPlan: (
    dispositionId: string,
    data: ConfirmProductionScrapSupplementPlanPayload,
    idempotencyKey: string,
  ) =>
    request<ApproveScrapSupplementResult>({
      url: `/production/abnormal-dispositions/${dispositionId}/scrap-supplement-plan/actions/confirm`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
};
