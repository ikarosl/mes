import type {
  PageQuery,
  PageResult,
  ProcurementReceiptQuery as ReceiptListQuery,
  ProcurementReceiptItem,
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ProcurementInboundReleaseQuery,
  ProcurementInboundReleaseItem,
  ProcurementInboundInspectionQuery,
  ProcurementInboundInspectionItem,
  ReceiptHistoryKind,
  ReceiptHistoryItem,
  PurchaseOrderQuery,
  PurchaseOrderItem,
  PurchaseOrderDetail,
} from '@company/contracts';

export abstract class ProcurementReceiptQuery {
  abstract listReceipts(query: ReceiptListQuery): Promise<PageResult<ProcurementReceiptItem>>;
  abstract getReceipt(id: string): Promise<ProcurementReceiptDetail>;
  abstract getReceiptLine(id: string): Promise<ProcurementReceiptLine>;
  abstract listInboundReleases(
    query: ProcurementInboundReleaseQuery,
  ): Promise<PageResult<ProcurementInboundReleaseItem>>;
  abstract listInspections(
    query: ProcurementInboundInspectionQuery,
  ): Promise<PageResult<ProcurementInboundInspectionItem>>;
  abstract getInspection(caseId: string): Promise<ProcurementInboundInspectionItem>;
  abstract history(
    id: string,
    kind: ReceiptHistoryKind,
    query: PageQuery,
  ): Promise<PageResult<ReceiptHistoryItem>>;
  abstract listReceiptOrders(query: PurchaseOrderQuery): Promise<PageResult<PurchaseOrderItem>>;
  abstract getReceiptOrder(id: string): Promise<PurchaseOrderDetail>;
}
