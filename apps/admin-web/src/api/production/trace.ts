import type {
  PageResult,
  ProductionTraceWorkOrderGroup,
  ProductionTraceDetail,
  ProductionTraceQuery,
} from '@company/contracts';
import { request, type ReadRequestOptions } from './request';

export const productionTraceApi = {
  searchProductionTrace: (
    params: ProductionTraceQuery,
    options: ReadRequestOptions = {},
  ): Promise<PageResult<ProductionTraceWorkOrderGroup>> =>
    request<PageResult<ProductionTraceWorkOrderGroup>>({
      ...options,
      url: '/production/trace',
      params,
    }),

  getProductionTrace: (
    batchId: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionTraceDetail> =>
    request<ProductionTraceDetail>({ ...options, url: `/production/trace/batches/${batchId}` }),
};
