import type {
  CreateSupplierPayload,
  PageResult,
  SupplierItem,
  SupplierQuery,
  UpdateSupplierPayload,
  SupplierOption,
  SupplierOptionQuery,
  MaterialOption,
  MaterialVariantItem,
  PurchaseOrderQuery,
  PurchaseOrderItem,
  PurchaseOrderDetail,
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  PlacePurchaseOrderPayload,
  CancelPurchaseOrderPayload,
  ClosePurchaseOrderLinePayload,
  CreatePurchaseOrderSupplementPayload,
  PurchaseOrderCommandResult,
  ProcurementDemandCandidateQuery,
  ProcurementDemandCandidate,
  ProcurementDemandResolution,
  RelatedPurchasesQuery,
  RelatedPurchasesResult,
  ProcurementReceiptQuery,
  ProcurementReceiptItem,
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ConfirmProcurementReceiptPayload,
  CorrectReceiptLinePayload,
  StartReceiptReviewPayload,
  InspectReceiptLinePayload,
  TerminateReceiptScopePayload,
  ConfirmSupplierReturnPayload,
  ProcurementReceiptCommandResult,
  ProcurementInboundInspectionQuery,
  ProcurementInboundInspectionItem,
  PageQuery,
  ReceiptRevisionItem,
  ReceiptScopeItem,
  SupplierReturnItem,
  ReceiptInboundHistoryItem,
  QualityInboundCaseItem,
} from '@company/contracts';
import { IDEMPOTENCY_KEY_HEADER, toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig): Promise<T> => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

const command = <T = PurchaseOrderCommandResult>(
  url: string,
  data: unknown,
  key: string,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> =>
  request({
    url,
    method,
    data,
    headers: { [IDEMPOTENCY_KEY_HEADER]: key },
    retryIdempotentWrite: true,
    retryTimes: 2,
  });

export const procurementApi = {
  listReceipts: (
    params: ProcurementReceiptQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementReceiptItem>> =>
    request({ url: '/procurement/receipts', params, signal, skipErrorHandling: true }),
  getReceipt: (id: string, signal?: AbortSignal): Promise<ProcurementReceiptDetail> =>
    request({ url: `/procurement/receipts/${id}`, signal, skipErrorHandling: true }),
  getReceiptLine: (id: string, signal?: AbortSignal): Promise<ProcurementReceiptLine> =>
    request({ url: `/procurement/receipt-lines/${id}`, signal, skipErrorHandling: true }),
  receiptOrderOptions: (
    params: PurchaseOrderQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<PurchaseOrderItem>> =>
    request({ url: '/procurement/receipt-order-options', params, signal, skipErrorHandling: true }),
  receiptOrderDetail: (id: string, signal?: AbortSignal): Promise<PurchaseOrderDetail> =>
    request({ url: `/procurement/receipt-order-options/${id}`, signal, skipErrorHandling: true }),
  confirmReceipt: (
    data: ConfirmProcurementReceiptPayload,
    key: string,
  ): Promise<ProcurementReceiptCommandResult> =>
    command('/procurement/receipts/actions/confirm', data, key),
  correctReceipt: (
    id: string,
    data: CorrectReceiptLinePayload,
    key: string,
  ): Promise<ProcurementReceiptCommandResult> =>
    command(`/procurement/receipt-lines/${id}/actions/correct-receipt`, data, key),
  startReview: (
    id: string,
    data: StartReceiptReviewPayload,
    key: string,
  ): Promise<ProcurementReceiptCommandResult> =>
    command(`/procurement/receipt-lines/${id}/actions/start-review`, data, key),
  inspectReceipt: (
    id: string,
    data: InspectReceiptLinePayload,
    key: string,
  ): Promise<ProcurementReceiptCommandResult> =>
    command(`/procurement/receipt-lines/${id}/actions/inspect`, data, key),
  terminateReceiptScope: (
    id: string,
    data: TerminateReceiptScopePayload,
    key: string,
  ): Promise<ProcurementReceiptCommandResult> =>
    command(`/procurement/receipt-lines/${id}/actions/terminate-return`, data, key),
  confirmSupplierReturn: (
    id: string,
    data: ConfirmSupplierReturnPayload,
    key: string,
  ): Promise<ProcurementReceiptCommandResult> =>
    command(`/procurement/receipt-lines/${id}/actions/return`, data, key),
  receiptRevisions: (
    id: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ReceiptRevisionItem>> =>
    request({
      url: `/procurement/receipt-lines/${id}/revisions`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  receiptScopes: (
    id: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ReceiptScopeItem>> =>
    request({
      url: `/procurement/receipt-lines/${id}/scopes`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  receiptCases: (
    id: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<QualityInboundCaseItem>> =>
    request({
      url: `/procurement/receipt-lines/${id}/cases`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  receiptReturns: (
    id: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<SupplierReturnItem>> =>
    request({
      url: `/procurement/receipt-lines/${id}/returns`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  receiptInbounds: (
    id: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ReceiptInboundHistoryItem>> =>
    request({
      url: `/procurement/receipt-lines/${id}/inbounds`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  listInspections: (
    params: ProcurementInboundInspectionQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementInboundInspectionItem>> =>
    request({
      url: '/quality/inbound-inspections',
      params: {
        ...params,
        receiptLineIds: params.receiptLineIds?.length ? params.receiptLineIds.join(',') : undefined,
      },
      signal,
      skipErrorHandling: true,
    }),
  getInspection: (id: string, signal?: AbortSignal): Promise<ProcurementInboundInspectionItem> =>
    request({ url: `/quality/inbound-inspections/${id}`, signal, skipErrorHandling: true }),
  inspectionReceiptLine: (id: string, signal?: AbortSignal): Promise<ProcurementReceiptLine> =>
    request({
      url: `/quality/inbound-inspections/receipt-lines/${id}`,
      signal,
      skipErrorHandling: true,
    }),
  listSuppliers: (params: SupplierQuery, signal?: AbortSignal): Promise<PageResult<SupplierItem>> =>
    request({ url: '/procurement/suppliers', params, signal, skipErrorHandling: true }),
  createSupplier: (data: CreateSupplierPayload): Promise<SupplierItem> =>
    request({ url: '/procurement/suppliers', method: 'POST', data }),
  updateSupplier: (id: string, data: UpdateSupplierPayload): Promise<SupplierItem> =>
    request({ url: `/procurement/suppliers/${id}`, method: 'PATCH', data }),
  supplierOptions: (params: SupplierOptionQuery): Promise<SupplierOption[]> =>
    request({
      url: '/procurement/suppliers/options',
      params: {
        ...params,
        includeIds: params.includeIds?.length ? params.includeIds.join(',') : undefined,
      },
      skipErrorHandling: true,
    }),
  materialOptions: (params: {
    keyword?: string;
    includeIds?: string[];
  }): Promise<MaterialOption[]> =>
    request({
      url: '/procurement/material-options',
      params: {
        ...params,
        includeIds: params.includeIds?.length ? params.includeIds.join(',') : undefined,
      },
      skipErrorHandling: true,
    }),
  materialVariantOptions: (materialId: string): Promise<MaterialVariantItem[]> =>
    request({
      url: '/procurement/material-variants/options',
      params: { materialId },
      skipErrorHandling: true,
    }),
  listOrders: (
    params: PurchaseOrderQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<PurchaseOrderItem>> =>
    request({ url: '/procurement/purchase-orders', params, signal, skipErrorHandling: true }),
  getOrder: (id: string, signal?: AbortSignal): Promise<PurchaseOrderDetail> =>
    request({ url: `/procurement/purchase-orders/${id}`, signal, skipErrorHandling: true }),
  createOrder: (
    data: CreatePurchaseOrderPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> => command('/procurement/purchase-orders', data, key),
  updateOrder: (
    id: string,
    data: UpdatePurchaseOrderPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-orders/${id}`, data, key, 'PATCH'),
  placeOrder: (
    id: string,
    data: PlacePurchaseOrderPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-orders/${id}/actions/place`, data, key),
  cancelOrder: (
    id: string,
    data: CancelPurchaseOrderPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-orders/${id}/actions/cancel`, data, key),
  closeOrderLine: (
    id: string,
    data: ClosePurchaseOrderLinePayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-order-lines/${id}/actions/close`, data, key),
  createSupplement: (
    id: string,
    data: CreatePurchaseOrderSupplementPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-order-lines/${id}/supplements`, data, key),
  demandCandidates: (
    params: ProcurementDemandCandidateQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementDemandCandidate>> =>
    request({ url: '/procurement/demand-candidates', params, signal, skipErrorHandling: true }),
  resolveDemands: (
    demandIds: string[],
    signal?: AbortSignal,
  ): Promise<ProcurementDemandResolution[]> =>
    request({
      url: '/procurement/demand-candidates/resolve',
      method: 'POST',
      data: { demandIds },
      signal,
      skipErrorHandling: true,
    }),
  relatedPurchases: (
    params: RelatedPurchasesQuery,
    signal?: AbortSignal,
  ): Promise<RelatedPurchasesResult> =>
    request({
      url: '/procurement/related-purchases',
      params: { ...params, demandIds: params.demandIds.join(',') },
      signal,
      skipErrorHandling: true,
    }),
};
