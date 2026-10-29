import type {
  BatchTerminationCheck,
  BatchCloseoutDetail,
  BatchCloseoutCommandResult,
  BatchCloseoutWithdrawalCheck,
  WithdrawBatchCloseoutPayload,
  WithdrawBatchCloseoutResult,
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  RecordCloseoutMaterialLossPayload,
  RecordCloseoutMaterialLossResult,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

export const productionCloseoutApi = {
  getBatchTerminationCheck: (id: string): Promise<BatchTerminationCheck> =>
    request<BatchTerminationCheck>({
      url: `/production/batches/${id}/termination-check`,
      skipErrorHandling: true,
    }),

  getBatchCloseout: (id: string): Promise<BatchCloseoutDetail | null> =>
    request<BatchCloseoutDetail | null>({
      url: `/production/batches/${id}/closeout`,
      skipErrorHandling: true,
    }),

  getCloseoutWithdrawalCheck: (
    batchId: string,
    options: ReadRequestOptions = {},
  ): Promise<BatchCloseoutWithdrawalCheck> =>
    request<BatchCloseoutWithdrawalCheck>({
      ...options,
      url: `/production/batches/${batchId}/closeout/withdraw-check`,
    }),

  withdrawBatchCloseout: (
    batchId: string,
    data: WithdrawBatchCloseoutPayload,
    idempotencyKey: string,
  ): Promise<WithdrawBatchCloseoutResult> =>
    request<WithdrawBatchCloseoutResult>({
      url: `/production/batches/${batchId}/closeout/withdraw`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

  beginBatchCloseout: (
    id: string,
    data: BeginBatchCloseoutPayload,
    idempotencyKey: string,
  ): Promise<BatchCloseoutCommandResult> =>
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
  ): Promise<BatchCloseoutCommandResult> =>
    request<BatchCloseoutCommandResult>({
      url: `/production/batches/${id}/closeout/items`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

  recordCloseoutMaterialLoss: (
    id: string,
    data: RecordCloseoutMaterialLossPayload,
    idempotencyKey: string,
  ): Promise<RecordCloseoutMaterialLossResult> =>
    request<RecordCloseoutMaterialLossResult>({
      url: `/production/batches/${id}/closeout/material-losses`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),
};
