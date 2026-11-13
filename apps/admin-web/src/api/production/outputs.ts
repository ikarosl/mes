import type {
  CreateProductionOutputInboundPayload,
  InventoryInboundBatchCandidate,
  PageResult,
  ProductionOutputInboundResult,
  ProductionOutputItem,
  ProductionOutputQuery,
  RevokeProductionOutputPayload,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@company/request';
import { request, type ReadRequestOptions } from './request';

export const productionOutputsApi = {
  list: (
    params: ProductionOutputQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionOutputItem>> =>
    request({ ...options, url: '/production/outputs', params }),
  revoke: (
    outputId: string,
    data: RevokeProductionOutputPayload,
    key: string,
  ): Promise<ProductionOutputItem> =>
    request({
      url: `/production/outputs/${outputId}/actions/revoke`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
    }),
  inbound: (
    batchId: string,
    data: CreateProductionOutputInboundPayload,
    key: string,
  ): Promise<ProductionOutputInboundResult> =>
    request({
      url: `/production/batches/${batchId}/output-inbounds`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: key },
    }),
  batchCandidates: (
    params: {
      productionBatchId: string;
      productId: string;
      unit: string;
      keyword?: string;
      page: number;
      pageSize: number;
    },
    options: ReadRequestOptions = {},
  ): Promise<PageResult<InventoryInboundBatchCandidate>> =>
    request({ ...options, url: '/warehouse/production-output-inbound-batch-candidates', params }),
};
