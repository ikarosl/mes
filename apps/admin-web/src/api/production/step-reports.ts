import type {
  PageResult,
  BatchStepReportCommandResult,
  BatchStepReportView,
  BatchStepReportDetail,
  BatchStepScrapRecordView,
  BatchReverseStepReportsPreview,
  BatchReverseStepReportsCommandResult,
  PreviewBatchReverseStepReportsPayload,
  BatchReverseStepReportsPayload,
  HistoricalBatchStepReportPayload,
  CorrectBatchStepReportCommandResult,
  CorrectBatchStepReportPayload,
  CreateBatchStepReportPayload,
  ReverseBatchStepReportPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

export const productionStepReportsApi = {
  listStepReports: (
    batchId: string,
    stepRecordId: string,
    params: { page: number; pageSize: number },
    options: ReadRequestOptions = {},
  ): Promise<PageResult<BatchStepReportView>> =>
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
  ): Promise<BatchStepReportDetail> =>
    request<BatchStepReportDetail>({
      ...options,
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/reports/${reportId}`,
    }),

  listStepScrapRecords: (
    batchId: string,
    stepRecordId: string,
    params: { page: number; pageSize: number },
    options: ReadRequestOptions = {},
  ): Promise<PageResult<BatchStepScrapRecordView>> =>
    request<PageResult<BatchStepScrapRecordView>>({
      ...options,
      url: `/production/batches/${batchId}/step-records/${stepRecordId}/scrap-records`,
      params,
    }),

  createStepReport: (
    batchId: string,
    stepRecordId: string,
    data: CreateBatchStepReportPayload,
    idempotencyKey: string,
  ): Promise<BatchStepReportCommandResult> =>
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
  ): Promise<BatchStepReportCommandResult> =>
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
  ): Promise<CorrectBatchStepReportCommandResult> =>
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
  ): Promise<BatchStepReportCommandResult> =>
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
  ): Promise<BatchStepReportCommandResult> =>
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
  ): Promise<CorrectBatchStepReportCommandResult> =>
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
  ): Promise<BatchReverseStepReportsPreview> =>
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
  ): Promise<BatchReverseStepReportsCommandResult> =>
    request<BatchReverseStepReportsCommandResult>({
      url: `/production/batches/${batchId}/step-reports/actions/reverse`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
};
