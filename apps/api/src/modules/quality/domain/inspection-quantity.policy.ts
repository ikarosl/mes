import {
  QUALITY_INSPECTION_METHODS,
  QUALITY_INBOUND_METHODS,
  QUALITY_RELEASE_DECISIONS,
} from '@company/constants';
import type {
  QualityInboundInspectionInput,
  QualityInspectionQuantities,
  QualityInspectionQuantityInput,
} from '@company/contracts';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { QualityCommandError } from '../quality-command.error.js';

const validQuantity = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_PERSISTED_INTEGER_QUANTITY;

/** Finished inspections record G/F and derive only the inspected count N. */
export function normalizeInspectionQuantities(
  input: QualityInspectionQuantityInput,
): QualityInspectionQuantities {
  const invalid = (message: string): never => {
    throw new QualityCommandError('INVALID_INPUT', message);
  };
  if (
    !QUALITY_INSPECTION_METHODS.includes(input.inspectionMethod) ||
    !QUALITY_RELEASE_DECISIONS.includes(input.releaseDecision)
  )
    invalid('检验方式或放行结论无效');
  if (!validQuantity(input.qualifiedQuantity) || !validQuantity(input.unqualifiedQuantity))
    invalid('合格数、不合格数必须为有效的非负整数');
  const inspectedQuantity = input.qualifiedQuantity + input.unqualifiedQuantity;
  if (!validQuantity(inspectedQuantity)) invalid('实际检查总数超过支持范围');
  if (input.inspectionMethod === 'zero_confirmation') {
    if (inspectedQuantity !== 0 || input.releaseDecision !== 'released')
      invalid('零量核实须明确放行且合格、不合格均为零');
  } else if (inspectedQuantity === 0) {
    invalid('须有实际检查数量');
  }
  return {
    ...input,
    inspectedQuantity,
  };
}

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
