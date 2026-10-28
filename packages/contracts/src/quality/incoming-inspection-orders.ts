import type { PageQuery, PageResult } from '../common.js';
import type { ProcurementSupplierSummary } from '../procurement/purchase-orders.js';
import type {
  ProcurementInboundInspectionLineItem,
  ProcurementReceiptVoidItem,
  ReceiptLineStage,
} from '../procurement/receipts.js';

export interface QualityIncomingInspectionOrderQuery extends PageQuery {
  keyword?: string;
  stage?: ReceiptLineStage;
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
  suppliers: ProcurementSupplierSummary[];
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
  items: ProcurementInboundInspectionLineItem[];
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
