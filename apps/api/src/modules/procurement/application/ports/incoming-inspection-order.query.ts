import type {
  PageQuery,
  PageResult,
  QualityIncomingInspectionLocation,
  QualityIncomingInspectionOrderItem,
  QualityIncomingInspectionOrderQuery,
  QualityIncomingInspectionOrderReceiptPage,
  QualityIncomingInspectionReceiptCandidateQuery,
  QualityIncomingInspectionReceiptItem,
  QualityIncomingInspectionReceiptLines,
} from '@company/contracts';

export abstract class IncomingInspectionOrderQuery {
  abstract list(
    query: QualityIncomingInspectionOrderQuery,
  ): Promise<PageResult<QualityIncomingInspectionOrderItem>>;
  abstract targets(
    query: PageQuery & { keyword?: string },
  ): Promise<PageResult<QualityIncomingInspectionOrderItem>>;
  abstract get(id: string): Promise<QualityIncomingInspectionOrderItem>;
  abstract receipts(
    id: string,
    query: PageQuery,
  ): Promise<QualityIncomingInspectionOrderReceiptPage>;
  abstract candidates(
    query: QualityIncomingInspectionReceiptCandidateQuery,
  ): Promise<PageResult<QualityIncomingInspectionReceiptItem>>;
  abstract receiptLines(receiptId: string): Promise<QualityIncomingInspectionReceiptLines>;
  abstract locate(receiptLineId: string): Promise<QualityIncomingInspectionLocation>;
}
