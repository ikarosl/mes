import type { PageQuery, PageResult } from '../common.js';
import type { ProcurementReceiptVoidItem } from '../procurement/receipts.js';
import type { QualityIncomingInspectionReportSummary } from './inbound-inspections.js';

export interface QualityIncomingInspectionOrderQuery extends PageQuery {
  keyword?: string;
  supplierId?: string;
}

/** A mutable work grouping, without an inspection status or cached quantities. */
export interface QualityIncomingInspectionOrderItem {
  id: string;
  inspectionNo: string;
  remark: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  version: number;
}

export type QualityIncomingInspectionOrderReference = Pick<
  QualityIncomingInspectionOrderItem,
  'id' | 'inspectionNo' | 'version'
>;

export interface QualityIncomingInspectionReceiptItem {
  receiptId: string;
  receiptNo: string;
  purchaseOrderId: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  receivedAt: string;
  lineCount: number;
  void: ProcurementReceiptVoidItem | null;
  order: QualityIncomingInspectionOrderReference | null;
}

export interface QualityIncomingInspectionOrderReceiptPage extends PageResult<QualityIncomingInspectionReceiptItem> {
  order: QualityIncomingInspectionOrderItem;
}

export interface QualityIncomingInspectionReceiptCandidateQuery extends PageQuery {
  keyword?: string;
  /** Defaults to unassigned, non-voided receipts. Assigned receipts include voided sources. */
  association?: 'unassigned' | 'assigned' | 'all';
}

export interface QualityIncomingInspectionReceiptLines {
  receipt: QualityIncomingInspectionReceiptItem;
  /** Complete current receipt scope, at most 100 lightweight rows. */
  items: QualityIncomingInspectionLineItem[];
}

/** Report counts and the newest registered fact are descriptive, without stock or release eligibility. */
export interface QualityIncomingInspectionLineItem {
  receiptLineId: string;
  receiptId: string;
  purchaseOrderId: string;
  itemName: string;
  materialVariantCode: string;
  unit: string;
  supplierBatchCode: string | null;
  void: ProcurementReceiptVoidItem | null;
  reportCount: number;
  latestReport: Pick<
    QualityIncomingInspectionReportSummary,
    | 'id'
    | 'reportNo'
    | 'inspectionMethod'
    | 'qualifiedQuantity'
    | 'unqualifiedQuantity'
    | 'inspectedQuantity'
    | 'inspectedAt'
  > | null;
}

export interface QualityIncomingInspectionLocation {
  receiptLineId: string;
  receiptId: string;
  order: QualityIncomingInspectionOrderReference | null;
}

export interface QualityIncomingInspectionExpectedOrder {
  orderId: string;
  expectedVersion: number;
}

export interface QualityIncomingInspectionInitialReceipt {
  receiptId: string;
  fromOrderId: string | null;
}

export interface QualityIncomingInspectionAssociationChange extends QualityIncomingInspectionInitialReceipt {
  toOrderId: string | null;
}

export interface CreateQualityIncomingInspectionOrderPayload {
  remark?: string | null;
  receipts: QualityIncomingInspectionInitialReceipt[];
  expectedOrders: QualityIncomingInspectionExpectedOrder[];
}

export interface UpdateQualityIncomingInspectionOrderPayload {
  expectedVersion: number;
  remark: string | null;
}

export interface ChangeQualityIncomingInspectionAssociationsPayload {
  changes: QualityIncomingInspectionAssociationChange[];
  expectedOrders: QualityIncomingInspectionExpectedOrder[];
}

export interface QualityIncomingInspectionAssociationResult {
  /** Each actually changed existing order advances once. */
  affectedOrders: QualityIncomingInspectionOrderReference[];
  changes: QualityIncomingInspectionAssociationChange[];
}

export interface CreateQualityIncomingInspectionOrderResult extends QualityIncomingInspectionAssociationResult {
  order: QualityIncomingInspectionOrderItem;
}
