import type {
  PageQuery,
  PageResult,
  ProcurementReceiptQuery as ReceiptListQuery,
  ProcurementReceiptItem,
  ProcurementReceiptLineListItem,
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ProcurementReceiptAcceptanceContext,
  ProcurementReceiptVoidingDetail,
  ProcurementInboundInspectionDetail,
  ProcurementInboundReleaseQuery,
  ProcurementInboundReleaseItem,
  ProcurementInboundInspectionCaseDetail,
  ReceiptHistoryKind,
  ReceiptHistoryItem,
  PurchaseOrderQuery,
  ProcurementReceiptOrderOption,
  PurchaseOrderDetail,
} from '@company/contracts';

export abstract class ProcurementReceiptQuery {
  abstract listReceipts(query: ReceiptListQuery): Promise<PageResult<ProcurementReceiptItem>>;
  abstract listReceiptLines(
    query: ReceiptListQuery,
  ): Promise<PageResult<ProcurementReceiptLineListItem>>;
  abstract getReceipt(id: string): Promise<ProcurementReceiptDetail>;
  abstract getReceiptLine(id: string): Promise<ProcurementReceiptLine>;
  abstract getReceiptAcceptanceContext(id: string): Promise<ProcurementReceiptAcceptanceContext>;
  abstract getReceiptVoiding(id: string): Promise<ProcurementReceiptVoidingDetail>;
  abstract getInspectionReceiptLine(id: string): Promise<ProcurementInboundInspectionDetail>;
  abstract listInboundReleases(
    query: ProcurementInboundReleaseQuery,
  ): Promise<PageResult<ProcurementInboundReleaseItem>>;
  abstract getInspection(caseId: string): Promise<ProcurementInboundInspectionCaseDetail>;
  abstract history(
    id: string,
    kind: ReceiptHistoryKind,
    query: PageQuery,
  ): Promise<PageResult<ReceiptHistoryItem>>;
  abstract listReceiptOrders(
    query: PurchaseOrderQuery,
  ): Promise<PageResult<ProcurementReceiptOrderOption>>;
  abstract getReceiptOrder(id: string): Promise<PurchaseOrderDetail>;
}
