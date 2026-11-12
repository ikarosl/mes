import type {
  JsonTableData,
  QualityIncomingInspectionReportItem,
  QualityIncomingInspectionReportSummary,
} from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString, toDateOnlyString } from '../../../common/time/date-time.js';

export type InspectionReportSummaryRow = RowDataPacket & {
  id: string;
  report_no: string;
  receipt_line_id: string;
  inspection_method: QualityIncomingInspectionReportSummary['inspectionMethod'];
  qualified_quantity: number;
  unqualified_quantity: number;
  previous_record_id: string | null;
  inspected_at: Date;
  result_note: string | null;
  created_by: string;
  created_at: Date;
};

export type InspectionReportRow = InspectionReportSummaryRow & {
  receipt_id: string;
  receipt_no_snapshot: string;
  purchase_no_snapshot: string;
  item_code_snapshot: string;
  item_name_snapshot: string;
  material_variant_code_snapshot: string;
  unit_snapshot: string;
  supplier_name_snapshot: string;
  specification: string | null;
  batch_no: string | null;
  expires_on: Date | string | null;
  evidence_reference: string | null;
  correction_reason: string | null;
  inspection_details: JsonTableData | string;
};

const nullableId = (value: string | number | null): string | null =>
  value == null ? null : String(value);

export function mapInspectionReportSummary(
  row: InspectionReportSummaryRow,
): QualityIncomingInspectionReportSummary {
  return {
    id: String(row.id),
    reportNo: row.report_no,
    receiptLineId: String(row.receipt_line_id),
    inspectionMethod: row.inspection_method,
    qualifiedQuantity: String(row.qualified_quantity),
    unqualifiedQuantity: String(row.unqualified_quantity),
    inspectedQuantity: String(Number(row.qualified_quantity) + Number(row.unqualified_quantity)),
    previousRecordId: nullableId(row.previous_record_id),
    inspectedAt: toBeijingISOString(row.inspected_at),
    remark: row.result_note,
    createdBy: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
  };
}

export function mapInspectionReport(row: InspectionReportRow): QualityIncomingInspectionReportItem {
  return {
    ...mapInspectionReportSummary(row),
    receiptId: String(row.receipt_id),
    receiptNo: row.receipt_no_snapshot,
    purchaseNo: row.purchase_no_snapshot,
    itemCode: row.item_code_snapshot,
    itemName: row.item_name_snapshot,
    materialVariantCode: row.material_variant_code_snapshot,
    unit: row.unit_snapshot,
    supplierName: row.supplier_name_snapshot,
    specification: row.specification,
    batchNo: row.batch_no,
    expiresOn: toDateOnlyString(row.expires_on),
    evidence: row.evidence_reference,
    correctionReason: row.correction_reason,
    inspectionDetails:
      typeof row.inspection_details === 'string'
        ? JSON.parse(row.inspection_details)
        : row.inspection_details,
  };
}
