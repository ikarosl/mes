import type {
  ApproveScrapSupplementResult,
  ProductionSupplementCandidateItem,
  ProductionScrapSupplementPlanItem,
  SaveProductionScrapSupplementPlanPayload,
  ConfirmProductionScrapSupplementPlanPayload,
  ApproveBatchStepReworkPayload,
  BatchStepAbnormalDispositionItem,
  CompleteReworkPayload,
  CompleteReworkResult,
  RejectBatchStepAbnormalDispositionPayload,
  ReworkRecordItem,
  ReworkRecordView,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

export const productionAbnormalDispositionsApi = {
  listBatchReworks: (
    batchId: string,
    options: ReadRequestOptions = {},
  ): Promise<ReworkRecordView[]> =>
    request<ReworkRecordView[]>({ ...options, url: `/production/batches/${batchId}/reworks` }),

  approveDispositionRework: (
    dispositionId: string,
    data: ApproveBatchStepReworkPayload,
  ): Promise<ReworkRecordItem> =>
    request<ReworkRecordItem>({
      url: `/production/abnormal-dispositions/${dispositionId}/actions/approve-rework`,
      method: 'POST',
      data,
    }),

  rejectAbnormalDisposition: (
    dispositionId: string,
    data: RejectBatchStepAbnormalDispositionPayload,
  ): Promise<BatchStepAbnormalDispositionItem> =>
    request<BatchStepAbnormalDispositionItem>({
      url: `/production/abnormal-dispositions/${dispositionId}/actions/reject`,
      method: 'POST',
      data,
    }),

  startRework: (reworkId: string, version: number): Promise<ReworkRecordItem> =>
    request<ReworkRecordItem>({
      url: `/production/reworks/${reworkId}/actions/start`,
      method: 'POST',
      data: { version },
    }),

  completeRework: (
    reworkId: string,
    data: CompleteReworkPayload,
    idempotencyKey: string,
  ): Promise<CompleteReworkResult> =>
    request<CompleteReworkResult>({
      url: `/production/reworks/${reworkId}/actions/complete`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  listSupplementCandidates: (dispositionId: string): Promise<ProductionSupplementCandidateItem[]> =>
    request<ProductionSupplementCandidateItem[]>({
      url: `/production/abnormal-dispositions/${dispositionId}/supplement-candidates`,
    }),

  getScrapSupplementPlan: (
    dispositionId: string,
  ): Promise<ProductionScrapSupplementPlanItem | null> =>
    request<ProductionScrapSupplementPlanItem | null>({
      url: `/production/abnormal-dispositions/${dispositionId}/scrap-supplement-plan`,
    }),

  saveScrapSupplementPlan: (
    dispositionId: string,
    data: SaveProductionScrapSupplementPlanPayload,
  ): Promise<ProductionScrapSupplementPlanItem> =>
    request<ProductionScrapSupplementPlanItem>({
      url: `/production/abnormal-dispositions/${dispositionId}/scrap-supplement-plan`,
      method: 'PUT',
      data,
    }),

  confirmScrapSupplementPlan: (
    dispositionId: string,
    data: ConfirmProductionScrapSupplementPlanPayload,
    idempotencyKey: string,
  ): Promise<ApproveScrapSupplementResult> =>
    request<ApproveScrapSupplementResult>({
      url: `/production/abnormal-dispositions/${dispositionId}/scrap-supplement-plan/actions/confirm`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
};
