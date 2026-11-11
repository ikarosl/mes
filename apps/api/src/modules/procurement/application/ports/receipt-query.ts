import type {
  PageQuery,
  PageResult,
  ProcurementReceiptQuery as ProcurementReceiptListQuery,
  ProcurementReceiptItem,
  ProcurementReceiptWorklistLines,
  ProcurementReceiptLineLocation,
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ProcurementReceiptVoidingDetail,
  ProcurementInboundSourceQuery,
  ProcurementInboundSourceItem,
  ReceiptHistoryKind,
  ReceiptHistoryItem,
  PurchaseOrderQuery,
  ProcurementReceiptOrderOption,
  PurchaseOrderDetail,
} from '@company/contracts';
export abstract class ProcurementReceiptQuery {
  abstract listReceipts(
    query: ProcurementReceiptListQuery,
  ): Promise<PageResult<ProcurementReceiptItem>>;
  abstract receiptWorklistLines(id: string): Promise<ProcurementReceiptWorklistLines>;
  abstract locateReceiptLine(id: string): Promise<ProcurementReceiptLineLocation>;
  abstract getReceipt(id: string): Promise<ProcurementReceiptDetail>;
  abstract getReceiptLine(id: string): Promise<ProcurementReceiptLine>;
  abstract getReceiptVoiding(id: string): Promise<ProcurementReceiptVoidingDetail>;
  abstract listInboundSources(
    query: ProcurementInboundSourceQuery,
  ): Promise<PageResult<ProcurementInboundSourceItem>>;
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
