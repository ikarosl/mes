import type {
  ConfirmProductionResearchOutputPayload,
  ConfirmProductionTrackingOutputPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionExecutionStartCheck,
  ProductionTrackingCardDetail,
  ProductionTrackingCardItem,
  ProductionTrackingCardQuery,
  ProductionTrackingOutput,
  ProductionTrackingReportQuery,
  ProductionTrackingScanResult,
  ProductionTrackingVisit,
  ProductionTrackingWorkbench,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

const headers = (key: string) => ({ [IDEMPOTENCY_KEY_HEADER]: key });
export const productionTrackingApi = {
  list: (
    params: ProductionTrackingCardQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionTrackingCardItem>> =>
    request({ ...options, url: '/production/tracking-cards', params }),
  detail: (id: string, options: ReadRequestOptions = {}): Promise<ProductionTrackingCardDetail> =>
    request({ ...options, url: `/production/tracking-cards/${id}` }),
  workbench: (id: string, options: ReadRequestOptions = {}): Promise<ProductionTrackingWorkbench> =>
    request({ ...options, url: `/production/batches/${id}/tracking-workbench` }),
  startCheck: (
    id: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionExecutionStartCheck> =>
    request({ ...options, url: `/production/batches/${id}/start-check` }),
  reports: (
    params: ProductionTrackingReportQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionTrackingVisit>> =>
    request({ ...options, url: '/production/tracking-reports', params }),
  create: (
    batchId: string,
    data: CreateProductionTrackingCardPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/batches/${batchId}/tracking-cards`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  scan: (
    data: ScanProductionTrackingCardPayload,
    key: string,
  ): Promise<ProductionTrackingScanResult> =>
    request({
      url: '/production/tracking-cards/scan',
      method: 'POST',
      data,
      headers: headers(key),
    }),
  correctQuantity: (
    id: string,
    data: CorrectProductionTrackingQuantityPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${id}/quantity`,
      method: 'PATCH',
      data,
      headers: headers(key),
    }),
  void: (
    id: string,
    data: VoidProductionTrackingCardPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${id}/actions/void`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  reportAbnormality: (
    id: string,
    data: CreateProductionTrackingAbnormalityPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${id}/abnormalities`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  handleAbnormality: (
    id: string,
    abnormalityId: string,
    data: HandleProductionTrackingAbnormalityPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${id}/abnormalities/${abnormalityId}/handlings`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  confirmOutput: (
    id: string,
    data: ConfirmProductionTrackingOutputPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${id}/actions/confirm-output`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  start: (
    batchId: string,
    data: { version: number; reason?: string },
    key: string,
  ): Promise<ProductionBatchDetail> =>
    request({
      url: `/production/batches/${batchId}/actions/start`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  finish: (
    batchId: string,
    data: FinishProductionTrackingTaskPayload,
    key: string,
  ): Promise<ProductionBatchDetail> =>
    request({
      url: `/production/batches/${batchId}/actions/finish`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  confirmResearchOutput: (
    batchId: string,
    data: ConfirmProductionResearchOutputPayload,
    key: string,
  ): Promise<ProductionTrackingOutput> =>
    request({
      url: `/production/batches/${batchId}/actions/confirm-research-output`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  reopen: (
    batchId: string,
    data: ReopenProductionTrackingTaskPayload,
    key: string,
  ): Promise<ProductionBatchDetail> =>
    request({
      url: `/production/batches/${batchId}/actions/reopen`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  sop: (batchId: string, stepId: string): Promise<Blob> =>
    request({
      url: `/production/batches/${batchId}/step-records/${stepId}/sop`,
      responseType: 'blob',
    }),
};
