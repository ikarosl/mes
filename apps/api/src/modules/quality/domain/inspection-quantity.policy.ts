import { QUALITY_INBOUND_METHODS } from '@company/constants';
import type { QualityIncomingInspectionReportInput } from '@company/contracts';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { QualityCommandError } from '../quality-command.error.js';

const validQuantity = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_PERSISTED_INTEGER_QUANTITY;

type IncomingInspectionQuantities = Pick<
  QualityIncomingInspectionReportInput,
  'inspectionMethod' | 'qualifiedQuantity' | 'unqualifiedQuantity'
> & { inspectedQuantity: number };

/** Actual inspected quantities do not authorize stock or assert an arrival quantity. */
export function normalizeIncomingInspectionQuantities(
  input: Pick<
    QualityIncomingInspectionReportInput,
    'inspectionMethod' | 'qualifiedQuantity' | 'unqualifiedQuantity'
  >,
): IncomingInspectionQuantities {
  if (!QUALITY_INBOUND_METHODS.includes(input.inspectionMethod)) {
    throw new QualityCommandError('INVALID_INPUT', '来料检验仅支持全检或抽检');
  }
  if (!validQuantity(input.qualifiedQuantity) || !validQuantity(input.unqualifiedQuantity)) {
    throw new QualityCommandError('INVALID_INPUT', '合格数、不合格数必须为有效非负整数');
  }
  const inspectedQuantity = input.qualifiedQuantity + input.unqualifiedQuantity;
  if (!validQuantity(inspectedQuantity) || inspectedQuantity === 0) {
    throw new QualityCommandError('INVALID_INPUT', '实际检查数量必须为正整数且不能超过支持范围');
  }
  return {
    qualifiedQuantity: input.qualifiedQuantity,
    unqualifiedQuantity: input.unqualifiedQuantity,
    inspectedQuantity,
    inspectionMethod: input.inspectionMethod,
  };
}
