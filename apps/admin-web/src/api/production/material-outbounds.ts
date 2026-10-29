import type {
  CreateMaterialOutboundPayload,
  MaterialOutboundCommandResult,
  MaterialOutboundItem,
  PageResult,
  MaterialOutboundQuery,
  MaterialOutboundBatchOption,
  MaterialOutboundCandidateItem,
  CancelMaterialOutboundPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, RequestError } from '@company/request';
import { request } from './request';

export const productionMaterialOutboundsApi = {
  createMaterialOutbound: async (
    batchId: string,
    data: CreateMaterialOutboundPayload,
    idempotencyKey: string,
  ): Promise<MaterialOutboundCommandResult> => {
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

  listMaterialOutbounds: (batchId: string): Promise<MaterialOutboundItem[]> =>
    request<MaterialOutboundItem[]>({ url: `/production/batches/${batchId}/material-outbounds` }),

  listMaterialOutboundOrders: (
    params: MaterialOutboundQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<MaterialOutboundItem>> =>
    request<PageResult<MaterialOutboundItem>>({
      url: '/production/material-outbounds',
      params,
      signal,
      skipErrorHandling: true,
    }),

  getMaterialOutbound: (outboundId: string, signal?: AbortSignal): Promise<MaterialOutboundItem> =>
    request<MaterialOutboundItem>({
      url: `/production/material-outbounds/${outboundId}`,
      signal,
      skipErrorHandling: true,
    }),

  listMaterialOutboundBatchOptions: (
    signal?: AbortSignal,
  ): Promise<MaterialOutboundBatchOption[]> =>
    request<MaterialOutboundBatchOption[]>({
      url: '/production/material-outbounds/batch-options',
      signal,
      skipErrorHandling: true,
    }),

  listMaterialOutboundCandidates: (
    batchId: string,
    signal?: AbortSignal,
  ): Promise<MaterialOutboundCandidateItem[]> =>
    request<MaterialOutboundCandidateItem[]>({
      url: `/production/batches/${batchId}/material-outbound-candidates`,
      signal,
      skipErrorHandling: true,
    }),

  confirmMaterialOutbound: (
    outboundId: string,
    version: number,
    idempotencyKey: string,
  ): Promise<MaterialOutboundCommandResult> =>
    request<MaterialOutboundCommandResult>({
      url: `/production/material-outbounds/${outboundId}/actions/confirm`,
      method: 'POST',
      data: { version },
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),

  cancelMaterialOutbound: (
    outboundId: string,
    data: CancelMaterialOutboundPayload,
  ): Promise<MaterialOutboundItem> =>
    request<MaterialOutboundItem>({
      url: `/production/material-outbounds/${outboundId}/actions/cancel`,
      method: 'POST',
      data,
    }),
};
