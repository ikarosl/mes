import { PROCESS_INSPECTION_METHODS, PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type { RecordProcessInspectionPayload } from '@company/contracts';
import { QualityCommandError } from '../quality-command.error.js';
export function requireProcessInspectionText(value: string, label: string): string {
  const text = value.trim();
  if (!text || text.length > 5000)
    throw new QualityCommandError('INVALID_INPUT', `${label}必填且不能超过5000字`);
  return text;
}
export function normalizeProcessInspection(
  payload: RecordProcessInspectionPayload,
): RecordProcessInspectionPayload {
  if (
    !PROCESS_INSPECTION_METHODS.includes(payload.inspectionMethod) ||
    !Number.isInteger(payload.qualifiedQuantity) ||
    !Number.isInteger(payload.unqualifiedQuantity) ||
    payload.qualifiedQuantity < 0 ||
    payload.unqualifiedQuantity < 0 ||
    payload.qualifiedQuantity + payload.unqualifiedQuantity < 1 ||
    payload.qualifiedQuantity + payload.unqualifiedQuantity > PRODUCTION_OUTPUT_QUANTITY_MAX
  ) {
    throw new QualityCommandError(
      'INVALID_INPUT',
      '请填写有效的全检或抽检数量，合格与不合格合计必须为正整数且不超过99999999',
    );
  }
  const inspectedAt = new Date(payload.inspectedAt);
  if (
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(payload.inspectedAt) ||
    !Number.isFinite(inspectedAt.getTime())
  ) {
    throw new QualityCommandError('INVALID_INPUT', '检验时间必须包含有效时区');
  }
  return {
    inspectionMethod: payload.inspectionMethod,
    qualifiedQuantity: payload.qualifiedQuantity,
    unqualifiedQuantity: payload.unqualifiedQuantity,
    inspectedAt: inspectedAt.toISOString(),
    scopeNote: requireProcessInspectionText(payload.scopeNote, '现场范围'),
    resultNote: requireProcessInspectionText(payload.resultNote, '检查说明'),
    evidenceReference: requireProcessInspectionText(payload.evidenceReference, '检查凭据'),
  };
}
