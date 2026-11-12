import { QUALITY_INBOUND_TEXT_MAX_LENGTH } from '@company/constants';
import type {
  JsonTableData,
  QualityIncomingInspectionReportInput,
  QualityIncomingInspectionReportSource,
} from '@company/contracts';
import { normalizeDateOnly, normalizeJsonTable, toBeijingISOString } from '@company/utils';
import { QualityCommandError } from '../quality-command.error.js';
import { normalizeIncomingInspectionQuantities } from './inspection-quantity.policy.js';

interface NormalizedIncomingInspectionReport {
  source: QualityIncomingInspectionReportSource & { batchNo: string };
  inspectionMethod: QualityIncomingInspectionReportInput['inspectionMethod'];
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  inspectedQuantity: number;
  inspectedAt: string;
  expiresOn: string | null;
  remark: string | null;
  evidence: string | null;
  previousRecordId: string | null;
  correctionReason: string | null;
  inspectionDetails: JsonTableData;
}

const invalid = (message: string): never => {
  throw new QualityCommandError('INVALID_INPUT', message);
};

export function requireInspectionIdentifier(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    BigInt(value) > 18446744073709551615n
  ) {
    invalid(`${label}无效`);
  }
  return value;
}

function requiredText(value: string, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    invalid(`${label}不能为空且最多 ${max} 字`);
  }
  return value.trim();
}

function optionalText(value: string | null | undefined, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > max) invalid(`${label}最多 ${max} 字`);
  return value.trim() || null;
}

export function normalizeIncomingInspectionDetails(value: unknown): JsonTableData {
  let details: JsonTableData;
  try {
    details = normalizeJsonTable(value);
  } catch (error) {
    if (error instanceof Error) return invalid(error.message);
    throw error;
  }
  if (details.columns.length === 0 || details.rows.length === 0)
    invalid('检验记录至少需要一列和一行数据');
  return details;
}

function inspectionTime(value: string): string {
  try {
    const normalized = toBeijingISOString(value);
    if (Number(normalized.slice(0, 4)) < 1000 || Number(normalized.slice(0, 4)) > 9999) {
      return invalid('检验时间无效');
    }
    return normalized;
  } catch {
    return invalid('检验时间必须为包含时区的有效日期时间');
  }
}

function expiryDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  try {
    const normalized = normalizeDateOnly(value);
    if (Number(normalized.slice(0, 4)) < 1000) return invalid('有效期日期无效');
    return normalized;
  } catch {
    return invalid('有效期必须为 YYYY-MM-DD 格式的有效日期');
  }
}

export function normalizeIncomingInspectionReport(
  source: QualityIncomingInspectionReportSource,
  input: QualityIncomingInspectionReportInput,
): NormalizedIncomingInspectionReport {
  const quantities = normalizeIncomingInspectionQuantities(input);
  const inspectedAt = inspectionTime(input.inspectedAt);
  const expiresOn = expiryDate(input.expiresOn);
  const inspectionDetails = normalizeIncomingInspectionDetails(input.inspectionDetails);
  const receiptNo = requiredText(source.receiptNo, '到货单号', 100);
  const previousRecordId =
    input.previousRecordId == null
      ? null
      : requireInspectionIdentifier(input.previousRecordId, '原检验报告');
  const correctionReason = optionalText(
    input.correctionReason,
    '修订原因',
    QUALITY_INBOUND_TEXT_MAX_LENGTH,
  );
  if (Boolean(previousRecordId) !== Boolean(correctionReason))
    invalid('修订报告须同时提供原报告和修订原因');
  return {
    source: {
      receiptId: requireInspectionIdentifier(source.receiptId, '到货单'),
      receiptLineId: requireInspectionIdentifier(source.receiptLineId, '到货明细'),
      receiptNo,
      purchaseNo: requiredText(source.purchaseNo, '采购单号', 100),
      itemCode: requiredText(source.itemCode, '材料编码', 100),
      itemName: requiredText(source.itemName, '材料名称', 200),
      materialVariantCode: requiredText(source.materialVariantCode, '材料版本编码', 180),
      unit: requiredText(source.unit, '单位', 20),
      supplierName: requiredText(source.supplierName, '供应商', 100),
      batchNo: receiptNo,
    },
    ...quantities,
    inspectedAt,
    expiresOn,
    remark: optionalText(input.remark, '异常说明', QUALITY_INBOUND_TEXT_MAX_LENGTH),
    evidence: optionalText(input.evidence, '检验凭据', QUALITY_INBOUND_TEXT_MAX_LENGTH),
    previousRecordId,
    correctionReason,
    inspectionDetails,
  };
}
