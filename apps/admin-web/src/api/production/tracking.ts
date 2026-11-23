import type {
  ConfirmProductionResearchOutputPayload,
  ConfirmProductionTrackingOutputPayload,
  BindProductionTrackingItemMarkPayload,
  CancelProductionTrackingItemMarkPayload,
  CorrectProductionTrackingItemMarkPayload,
  CorrectProductionTrackingAbnormalityScrapPayload,
  CorrectProductionTrackingQuantityPayload,
  CreateProductionTrackingAbnormalityPayload,
  CreateProductionTrackingCardPayload,
  CreateProductionTrackingCardsPayload,
  FinishProductionTrackingTaskPayload,
  HandleProductionTrackingAbnormalityPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionExecutionStartCheck,
  ProductionTrackingCardDetail,
  ProductionTrackingCardItem,
  ProductionTrackingCardQuery,
  ProductionTrackingItemMark,
  ProductionTrackingItemMarkCodeAvailability,
  ProductionTrackingItemMarkQuery,
  ProductionTrackingItemMarkWorkspaceQuery,
  ProductionTrackingItemMarkWorkspaceRow,
  SaveProductionTrackingItemMarkWorkspacePayload,
  SaveProductionTrackingItemMarkWorkspaceResult,
  ProductionTrackingItemMarkCorrection,
  ProductionTrackingAbnormalityDescriptionQuery,
  ProductionTrackingCardsCreatedResult,
  ProductionTrackingOutput,
  ProductionTrackingReportQuery,
  ProductionTrackingScanResult,
  ProductionTrackingVisit,
  ProductionTrackingWorkbench,
  ReopenProductionTrackingTaskPayload,
  ScanProductionTrackingCardPayload,
  VoidProductionTrackingAbnormalityPayload,
  VoidProductionTrackingCardPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

const headers = (key: string) => ({ [IDEMPOTENCY_KEY_HEADER]: key });
export const productionTrackingApi = {
  itemMarkWorkspace: (
    params: ProductionTrackingItemMarkWorkspaceQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionTrackingItemMarkWorkspaceRow>> =>
    request({ ...options, url: '/production/tracking-item-marks/workspace', params }),
  saveItemMarkWorkspace: (
    batchId: string,
    data: SaveProductionTrackingItemMarkWorkspacePayload,
    key: string,
  ): Promise<SaveProductionTrackingItemMarkWorkspaceResult> =>
    request({
      url: `/production/batches/${batchId}/tracking-item-marks/workspace`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  itemMarkCodeAvailability: (
    markCode: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionTrackingItemMarkCodeAvailability> =>
    request({
      ...options,
      url: '/production/tracking-item-marks/code-availability',
      params: { markCode },
    }),
  itemMark: (
    cardId: string,
    markId: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionTrackingItemMark> =>
    request({ ...options, url: `/production/tracking-cards/${cardId}/item-marks/${markId}` }),
  itemMarkCorrections: (
    cardId: string,
    markId: string,
    params: { page: number; pageSize: number },
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionTrackingItemMarkCorrection>> =>
    request({
      ...options,
      url: `/production/tracking-cards/${cardId}/item-marks/${markId}/corrections`,
      params,
    }),
  correctItemMark: (
    cardId: string,
    markId: string,
    data: CorrectProductionTrackingItemMarkPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${cardId}/item-marks/${markId}/actions/correct`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  itemMarks: (
    params: ProductionTrackingItemMarkQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionTrackingItemMark>> =>
    request({ ...options, url: '/production/tracking-item-marks', params }),
  bindItemMark: (
    cardId: string,
    data: BindProductionTrackingItemMarkPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${cardId}/item-marks`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  cancelItemMark: (
    cardId: string,
    markId: string,
    data: CancelProductionTrackingItemMarkPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${cardId}/item-marks/${markId}/actions/cancel`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  list: (
    params: ProductionTrackingCardQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionTrackingCardItem>> =>
    request({ ...options, url: '/production/tracking-cards', params }),
  detail: (id: string, options: ReadRequestOptions = {}): Promise<ProductionTrackingCardDetail> =>
    request({ ...options, url: `/production/tracking-cards/${id}` }),
  abnormalityDescriptionOptions: (
    id: string,
    params: ProductionTrackingAbnormalityDescriptionQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<string>> =>
    request({
      ...options,
      url: `/production/tracking-cards/${id}/abnormality-description-options`,
      params,
    }),
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
  createBulk: (
    batchId: string,
    data: CreateProductionTrackingCardsPayload,
    key: string,
  ): Promise<ProductionTrackingCardsCreatedResult> =>
    request({
      url: `/production/batches/${batchId}/tracking-cards/bulk`,
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
  correctAbnormalityScrap: (
    cardId: string,
    abnormalityId: string,
    data: CorrectProductionTrackingAbnormalityScrapPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${cardId}/abnormalities/${abnormalityId}/scrap-correction`,
      method: 'POST',
      data,
      headers: headers(key),
    }),
  voidAbnormality: (
    cardId: string,
    abnormalityId: string,
    data: VoidProductionTrackingAbnormalityPayload,
    key: string,
  ): Promise<ProductionTrackingCardDetail> =>
    request({
      url: `/production/tracking-cards/${cardId}/abnormalities/${abnormalityId}/void`,
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
