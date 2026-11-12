import type { QualityInspectionMethod } from './inspection.js';
import type { PageResult } from '../common.js';
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
  /** Empty for first registration; subsequent saves must reference the current report. */
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
  inspectedAt: string;
  remark: string | null;
  createdBy: string;
  createdAt: string;
}

export interface QualityIncomingInspectionReportPage extends PageResult<QualityIncomingInspectionReportSummary> {
  /** Latest registered report for the source, independent of the requested history page. */
  currentReportId: string | null;
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
