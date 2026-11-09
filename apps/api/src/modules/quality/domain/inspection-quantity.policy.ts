import { QUALITY_INBOUND_METHODS, QUALITY_RELEASE_DECISIONS } from '@company/constants';
import type { QualityInboundInspectionInput } from '@company/contracts';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { QualityCommandError } from '../quality-command.error.js';

const validQuantity = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_PERSISTED_INTEGER_QUANTITY;

type IncomingInspectionQuantities = Pick<
  QualityInboundInspectionInput,
  'inspectionMethod' | 'qualifiedQuantity' | 'unqualifiedQuantity' | 'releaseDecision'
> & { inspectedQuantity: number };

/** Incoming Quality records measurements only; warehouse confirmation owns C and final allocation. */
export function normalizeIncomingInspectionQuantities(
  input: QualityInboundInspectionInput,
): IncomingInspectionQuantities {
  if (
    !QUALITY_INBOUND_METHODS.includes(input.inspectionMethod) ||
    !QUALITY_RELEASE_DECISIONS.includes(input.releaseDecision)
  ) {
    throw new QualityCommandError('INVALID_INPUT', '来料检验仅支持全检或抽检及有效放行结论');
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
    releaseDecision: input.releaseDecision,
  };
}
