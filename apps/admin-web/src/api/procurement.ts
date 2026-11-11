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
  PurchaseOrderLineReceiptRecordQuery,
  PurchaseOrderLineReceiptRecordPage,
  PurchaseExcessReceiptCandidateQuery,
  PurchaseExcessReceiptCandidate,
  PurchaseQualityReplacementCandidateQuery,
  PurchaseQualityReplacementCandidate,
  PurchaseOrderItem,
  ProcurementReceiptOrderOption,
  PurchaseOrderDetail,
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  PlacePurchaseOrderPayload,
  CancelPurchaseOrderPayload,
  ClosePurchaseOrderPayload,
  ClosePurchaseOrderLinePayload,
  ReopenPurchaseOrderLinePayload,
  CorrectPurchaseOrderAmountsPayload,
  CreatePurchaseOrderSupplementPayload,
  PurchaseOrderCommandResult,
  ProcurementDemandCandidateQuery,
  ProcurementDemandWorkOrder,
  ProcurementDemandWorkOrderQuery,
  ProcurementDemandCandidate,
  ProcurementDemandResolution,
  RelatedPurchasesQuery,
  RelatedPurchasesResult,
  ProcurementReceiptQuery,
  ProcurementReceiptItem,
  ProcurementReceiptWorklistLines,
  ProcurementReceiptLineLocation,
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ProcurementReceiptVoidingDetail,
  ConfirmProcurementReceiptPayload,
  VoidProcurementReceiptPayload,
  VoidProcurementReceiptCommandResult,
  ProcurementReceiptCommandResult,
  PageQuery,
  ReceiptInboundHistoryItem,
  ReceiptHandlingItem,
  RecordReceiptHandlingPayload,
  QualityIncomingInspectionReportInput,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportSummary,
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
  });

export const procurementApi = {
  purchaseOrderLineReceiptRecords: (
    purchaseOrderLineId: string,
    params: PurchaseOrderLineReceiptRecordQuery,
    signal?: AbortSignal,
  ): Promise<PurchaseOrderLineReceiptRecordPage> =>
    request({
      url: `/procurement/purchase-order-lines/${purchaseOrderLineId}/receipt-records`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  excessReceiptCandidates: (
    purchaseOrderLineId: string,
    params: PurchaseExcessReceiptCandidateQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<PurchaseExcessReceiptCandidate>> =>
    request({
      url: `/procurement/purchase-order-lines/${purchaseOrderLineId}/excess-receipt-candidates`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  qualityReplacementCandidates: (
    purchaseOrderLineId: string,
    params: PurchaseQualityReplacementCandidateQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<PurchaseQualityReplacementCandidate>> =>
    request({
      url: `/procurement/purchase-order-lines/${purchaseOrderLineId}/quality-replacement-candidates`,
      params,
      signal,
      skipErrorHandling: true,
    }),
  listReceipts: (
    params: ProcurementReceiptQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementReceiptItem>> =>
    request({ url: '/procurement/receipts', params, signal, skipErrorHandling: true }),
  receiptWorklistLines: (
    id: string,
    signal?: AbortSignal,
  ): Promise<ProcurementReceiptWorklistLines> =>
    request({ url: `/procurement/receipts/${id}/worklist-lines`, signal, skipErrorHandling: true }),
  locateReceiptLine: (id: string, signal?: AbortSignal): Promise<ProcurementReceiptLineLocation> =>
    request({ url: `/procurement/receipt-lines/${id}/location`, signal, skipErrorHandling: true }),
  getReceipt: (id: string, signal?: AbortSignal): Promise<ProcurementReceiptDetail> =>
    request({ url: `/procurement/receipts/${id}`, signal, skipErrorHandling: true }),
  getReceiptLine: (id: string, signal?: AbortSignal): Promise<ProcurementReceiptLine> =>
    request({ url: `/procurement/receipt-lines/${id}`, signal, skipErrorHandling: true }),
  receiptVoiding: (id: string, signal?: AbortSignal): Promise<ProcurementReceiptVoidingDetail> =>
    request({ url: `/procurement/receipts/${id}/voiding`, signal, skipErrorHandling: true }),
  receiptOrderOptions: (
    params: PurchaseOrderQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementReceiptOrderOption>> =>
    request({ url: '/procurement/receipt-order-options', params, signal, skipErrorHandling: true }),
  receiptOrderDetail: (id: string, signal?: AbortSignal): Promise<PurchaseOrderDetail> =>
    request({ url: `/procurement/receipt-order-options/${id}`, signal, skipErrorHandling: true }),
  confirmReceipt: (
    data: ConfirmProcurementReceiptPayload,
    key: string,
  ): Promise<ProcurementReceiptCommandResult> =>
    command('/procurement/receipts/actions/confirm', data, key),
  voidReceipt: (
    id: string,
    data: VoidProcurementReceiptPayload,
    key: string,
  ): Promise<VoidProcurementReceiptCommandResult> =>
    command(`/procurement/receipts/${id}/actions/void`, data, key),
  inspectReceipt: (
    id: string,
    data: QualityIncomingInspectionReportInput,
    key: string,
  ): Promise<QualityIncomingInspectionReportItem> =>
    command(`/procurement/receipt-lines/${id}/inspect`, data, key),
  recordReceiptHandling: (
    id: string,
    body: RecordReceiptHandlingPayload,
    key: string,
  ): Promise<ReceiptHandlingItem> =>
    command(`/procurement/receipt-lines/${id}/handlings`, body, key),
  receiptHandlings: (
    id: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ReceiptHandlingItem>> =>
    request({
      url: `/procurement/receipt-lines/${id}/handlings`,
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
  getInspection: (id: string, signal?: AbortSignal): Promise<QualityIncomingInspectionReportItem> =>
    request({ url: `/quality/inbound-inspections/reports/${id}`, signal, skipErrorHandling: true }),
  inspectionReports: (
    id: string,
    params: PageQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<QualityIncomingInspectionReportSummary>> =>
    request({
      url: `/quality/inbound-inspections/${id}/reports`,
      params,
      signal,
      skipErrorHandling: true,
    }),
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
  closeOrder: (
    id: string,
    data: ClosePurchaseOrderPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-orders/${id}/actions/close`, data, key),
  closeOrderLine: (
    id: string,
    data: ClosePurchaseOrderLinePayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-order-lines/${id}/actions/close`, data, key),
  reopenOrderLine: (
    id: string,
    data: ReopenPurchaseOrderLinePayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-order-lines/${id}/actions/reopen`, data, key),
  correctOrderAmounts: (
    id: string,
    data: CorrectPurchaseOrderAmountsPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-orders/${id}/actions/correct-amounts`, data, key),
  createSupplement: (
    id: string,
    data: CreatePurchaseOrderSupplementPayload,
    key: string,
  ): Promise<PurchaseOrderCommandResult> =>
    command(`/procurement/purchase-orders/${id}/supplements`, data, key),
  demandWorkOrders: (
    params: ProcurementDemandWorkOrderQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementDemandWorkOrder>> =>
    request({ url: '/procurement/demand-work-orders', params, signal, skipErrorHandling: true }),
  demandCandidates: (
    params: ProcurementDemandCandidateQuery,
    signal?: AbortSignal,
  ): Promise<PageResult<ProcurementDemandCandidate>> =>
    request({ url: '/procurement/demand-candidates', params, signal, skipErrorHandling: true }),
  resolveDemands: (
    workOrderId: string,
    demandIds: string[],
    signal?: AbortSignal,
  ): Promise<ProcurementDemandResolution[]> =>
    request({
      url: '/procurement/demand-candidates/resolve',
      method: 'POST',
      data: { workOrderId, demandIds },
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
