import type {
  JsonTableData,
  QualityIncomingInspectionReportInput,
  QualityIncomingInspectionReportItem,
  QualityInspectionMethod,
} from '@company/contracts';
import {
  PURCHASE_ORDER_MAX_QUANTITY,
  QUALITY_INCOMING_INSPECTION_REPORT_COLUMN_LABELS,
  QUALITY_INCOMING_INSPECTION_REPORT_DEFAULT_ITEMS,
} from '@company/constants';
import { normalizeJsonTable, toBeijingISOString } from '@company/utils';
export interface InboundInspectionDraft {
  inspectionMethod: QualityInspectionMethod;
  qualifiedQuantity: number | undefined;
  unqualifiedQuantity: number | undefined;
  inspectedAt: string;
  expiresOn: string;
  remark: string;
  evidence: string;
  previousRecordId: string | null;
  correctionReason: string;
  inspectionDetails: JsonTableData;
}
export const initialInboundInspection = (): InboundInspectionDraft => ({
  inspectionMethod: 'full',
  qualifiedQuantity: undefined,
  unqualifiedQuantity: undefined,
  inspectedAt: toBeijingISOString(Date.now()),
  expiresOn: '',
  remark: '',
  evidence: '',
  previousRecordId: null,
  correctionReason: '',
  inspectionDetails: {
    columns: Object.entries(QUALITY_INCOMING_INSPECTION_REPORT_COLUMN_LABELS).map(
      ([key, label]) => ({
        key,
        label,
      }),
    ),
    rows: QUALITY_INCOMING_INSPECTION_REPORT_DEFAULT_ITEMS.map((inspectionItem) => ({
      inspectionItem,
      acceptanceRequirement: '',
      inspectionTool: '目视',
      contentDescription: '',
      inspectionResult: '',
    })),
  },
});
export const correctionInboundInspection = (
  record: QualityIncomingInspectionReportItem,
): InboundInspectionDraft => ({
  inspectionMethod: record.inspectionMethod,
  qualifiedQuantity: Number(record.qualifiedQuantity),
  unqualifiedQuantity: Number(record.unqualifiedQuantity),
  inspectedAt: record.inspectedAt,
  expiresOn: record.expiresOn ?? '',
  remark: record.remark ?? '',
  evidence: record.evidence ?? '',
  previousRecordId: record.id,
  correctionReason: '',
  inspectionDetails: {
    columns: record.inspectionDetails.columns.map((column) => ({ ...column })),
    rows: record.inspectionDetails.rows.map((row) => ({ ...row })),
  },
});

/** New reports use the shared table format; saved historical cells remain unchanged when viewed. */
export function normalizeInboundInspectionDetails(value: unknown): JsonTableData {
  const table = normalizeJsonTable(value);
  if (!table.columns.length || !table.rows.length) throw new Error('请至少保留一列和一行检查记录');
  return table;
}
export function inboundInspectionPreview(
  input: InboundInspectionDraft,
): { qualifiedQuantity: number; unqualifiedQuantity: number; inspectedQuantity: number } | null {
  const good = input.qualifiedQuantity,
    bad = input.unqualifiedQuantity;
  if (
    good === undefined ||
    bad === undefined ||
    !Number.isSafeInteger(good) ||
    !Number.isSafeInteger(bad) ||
    good < 0 ||
    bad < 0 ||
    good + bad <= 0 ||
    good + bad > PURCHASE_ORDER_MAX_QUANTITY
  )
    return null;
  return { qualifiedQuantity: good, unqualifiedQuantity: bad, inspectedQuantity: good + bad };
}
export function inboundInspectionInput(
  input: InboundInspectionDraft,
): QualityIncomingInspectionReportInput | null {
  const quantities = inboundInspectionPreview(input);
  if (
    !quantities ||
    !input.inspectedAt ||
    !Number.isFinite(Date.parse(input.inspectedAt)) ||
    (input.previousRecordId && !input.correctionReason.trim())
  )
    return null;
  let inspectionDetails: JsonTableData;
  try {
    inspectionDetails = normalizeInboundInspectionDetails(input.inspectionDetails);
  } catch {
    return null;
  }
  return {
    inspectionMethod: input.inspectionMethod,
    qualifiedQuantity: quantities.qualifiedQuantity,
    unqualifiedQuantity: quantities.unqualifiedQuantity,
    inspectedAt: toBeijingISOString(input.inspectedAt),
    expiresOn: input.expiresOn || null,
    remark: input.remark.trim() || null,
    evidence: input.evidence.trim() || null,
    previousRecordId: input.previousRecordId,
    correctionReason: input.correctionReason.trim() || null,
    inspectionDetails,
  };
}

const LAST_TEMPLATE_ID_KEY = 'easy-mes:incoming-inspection:last-template-id';

export function getLastInboundInspectionTemplateId(): string | null {
  try {
    return localStorage.getItem(LAST_TEMPLATE_ID_KEY);
  } catch {
    // 浏览器存储不可用时仍可使用默认检查记录。
    return null;
  }
}

export function rememberInboundInspectionTemplateId(id: string): boolean {
  try {
    localStorage.setItem(LAST_TEMPLATE_ID_KEY, id);
    return true;
  } catch {
    // 记住模板为 best-effort，不影响本次已应用的草稿。
    return false;
  }
}
