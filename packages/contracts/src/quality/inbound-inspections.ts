import type { QualityInspectionMethod } from './inspection.js';
import type { JsonTableData } from '../template.js';

/** Source identity is supplied by Procurement after checking the locked, non-voided receipt. */
export interface QualityIncomingInspectionReportSource {
  receiptId: string;
  receiptLineId: string;
  receiptNo: string;
  purchaseNo: string;
  itemCode: string;
  itemName: string;
  materialVariantCode: string;
  unit: string;
  supplierName: string;
}

export interface QualityIncomingInspectionReportInput {
  inspectionMethod: QualityInspectionMethod;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  inspectedAt: string;
  expiresOn?: string | null;
  remark?: string | null;
  evidence?: string | null;
  /** A complete independent copy; no template identity or live template binding is saved. */
  inspectionDetails: JsonTableData;
  /** Corrections append a fact referencing the original report for the same receipt line. */
  previousRecordId?: string | null;
  correctionReason?: string | null;
}

export interface QualityIncomingInspectionReportSummary {
  id: string;
  reportNo: string;
  receiptLineId: string;
  inspectionMethod: QualityInspectionMethod;
  qualifiedQuantity: string;
  unqualifiedQuantity: string;
  inspectedQuantity: string;
  previousRecordId: string | null;
  /** Derived from the immutable correction reference; no field is updated on the original report. */
  correctedByRecordId: string | null;
  inspectedAt: string;
  remark: string | null;
  createdBy: string;
  createdAt: string;
}

/** Persisted report content is the source for printing, including its header snapshot. */
export interface QualityIncomingInspectionReportItem
  extends QualityIncomingInspectionReportSource, QualityIncomingInspectionReportSummary {
  /** Archived manual text from older reports; printing uses materialVariantCode. */
  specification: string | null;
  /** Saved print snapshot; new reports use the trusted receipt number. */
  batchNo: string | null;
  expiresOn: string | null;
  evidence: string | null;
  correctionReason: string | null;
  inspectionDetails: JsonTableData;
}
