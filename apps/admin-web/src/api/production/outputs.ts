import type {
  ProductionApprovalResult,
  ProductionOutputDetail,
  SaveProductionOutputPayload,
  ReviewProductionOutputMaterialPayload,
  SubmitProductionOutputPayload,
  BeginProductionOutputCorrectionPayload,
  ProductionOutputCommandResult,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request } from './request';

export const productionOutputsApi = {
  getProductionOutput: (id: string): Promise<ProductionOutputDetail> =>
    request<ProductionOutputDetail>({
      url: `/production/batches/${id}/output`,
      skipErrorHandling: true,
    }),

  reviewProductionOutputMaterial: (
    id: string,
    data: ReviewProductionOutputMaterialPayload,
    idempotencyKey: string,
  ): Promise<ProductionOutputCommandResult> =>
    request<ProductionOutputCommandResult>({
      url: `/production/batches/${id}/output/material-review`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

  saveProductionOutput: (
    id: string,
    data: SaveProductionOutputPayload,
    idempotencyKey: string,
  ): Promise<ProductionOutputCommandResult> =>
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
  ): Promise<ProductionApprovalResult> =>
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
  ): Promise<ProductionOutputCommandResult> =>
    request<ProductionOutputCommandResult>({
      url: `/production/batches/${id}/output/corrections`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

  cancelProductionOutputCorrection: (
    id: string,
    version: number,
    idempotencyKey: string,
  ): Promise<ProductionOutputCommandResult> =>
    request<ProductionOutputCommandResult>({
      url: `/production/batches/${id}/output/corrections/cancel`,
      method: 'POST',
      data: { version },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
};
