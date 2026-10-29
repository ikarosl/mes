import type {
  DemandCorrectionCheck,
  DemandCorrectionHistoryItem,
  SubmitDemandCorrectionPayload,
  ProductionApprovalResult,
  ProductionMaterialDemandItem,
  MaterialDemandManagementPage,
  MaterialOption,
  ProductionMaterialOptionsQuery,
  MaterialDemandManagementQuery,
  ConfigureMaterialDemandsPayload,
  AddManualMaterialDemandsPayload,
  AddManualMaterialDemandsResult,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, RequestError } from '@company/request';
import { request, type ReadRequestOptions } from './request';

export const productionMaterialDemandsApi = {
  productionMaterialOptions: (params: ProductionMaterialOptionsQuery): Promise<MaterialOption[]> =>
    request<MaterialOption[]>({
      url: '/production/material-demands/material-options',
      params,
      skipErrorHandling: true,
    }),

  getDemandCorrectionCheck: (
    id: string,
    options: ReadRequestOptions = {},
  ): Promise<DemandCorrectionCheck> =>
    request<DemandCorrectionCheck>({
      url: `/production/material-demands/${id}/correction-check`,
      skipErrorHandling: true,
      ...options,
    }),

  getDemandCorrectionHistory: (
    id: string,
    options: ReadRequestOptions = {},
  ): Promise<DemandCorrectionHistoryItem[]> =>
    request<DemandCorrectionHistoryItem[]>({
      url: `/production/material-demands/${id}/corrections`,
      skipErrorHandling: true,
      ...options,
    }),

  submitDemandCorrection: (
    id: string,
    data: SubmitDemandCorrectionPayload,
    idempotencyKey: string,
  ): Promise<ProductionApprovalResult> =>
    request<ProductionApprovalResult>({
      url: `/production/material-demands/${id}/corrections`,
      method: 'POST',
      data,
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      skipErrorHandling: true,
    }),

  listMaterialDemands: (
    batchId: string,
    options: ReadRequestOptions = {},
  ): Promise<ProductionMaterialDemandItem[]> =>
    request<ProductionMaterialDemandItem[]>({
      ...options,
      url: `/production/batches/${batchId}/material-demands`,
    }),

  /**
   * Cross-batch administrator view. Normal demand is configured explicitly by
   * base BOM line; this endpoint must return every enabled variant, but must not
   * query or display inventory and must not auto-select a version on the client's behalf.
   */
  listMaterialDemandManagement: (
    params: MaterialDemandManagementQuery,
  ): Promise<MaterialDemandManagementPage> =>
    request<MaterialDemandManagementPage>({ url: '/production/material-demands', params }),

  configureMaterialDemands: async (
    batchId: string,
    data: ConfigureMaterialDemandsPayload,
    idempotencyKey: string,
  ): Promise<{ configured: true }> => {
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
  ): Promise<AddManualMaterialDemandsResult> => {
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
};
