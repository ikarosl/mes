import {
  QUALITY_INBOUND_DISPOSITIONS,
  QUALITY_INBOUND_METHODS,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
} from '@company/constants';
import type { QualityInboundCaseType, QualityInboundInspectionInput } from '@company/contracts';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { QualityCommandError } from '../quality-command.error.js';

const invalid = (message: string): never => {
  throw new QualityCommandError('INVALID_INPUT', message);
};
export function requireQuantity(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PERSISTED_INTEGER_QUANTITY) {
    invalid(`${label}必须是 0 至 ${MAX_PERSISTED_INTEGER_QUANTITY} 的整数`);
  }
}
export function requireQualityText(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > QUALITY_INBOUND_TEXT_MAX_LENGTH
  ) {
    invalid(`${label}不能为空且最多 ${QUALITY_INBOUND_TEXT_MAX_LENGTH} 字`);
  }
  return value.trim();
}

/** 从真实检验输入推导处置量，调用方不能自行提交三种结果量。 */
export function resolveInboundInspection(
  coveredQuantity: number,
  caseType: QualityInboundCaseType,
  input: QualityInboundInspectionInput,
): { approvedQuantity: number; qualityReturnQuantity: number; undeterminedQuantity: number } {
  requireQuantity(coveredQuantity, '覆盖数量');
  requireQuantity(input.removedDefectQuantity, '剔除不良数量');
  requireQualityText(input.remark, '检验说明');
  requireQualityText(input.evidence, '检验凭据');
  if (
    !QUALITY_INBOUND_METHODS.includes(input.inspectionMethod) ||
    !QUALITY_INBOUND_DISPOSITIONS.includes(input.disposition) ||
    typeof input.inboundApproved !== 'boolean'
  )
    invalid('检验方法、批准或处置代码不合法');
  if (input.removedDefectQuantity > coveredQuantity) invalid('剔除数量不能超过覆盖数量');
  if (coveredQuantity === 0) {
    if (
      caseType !== 'receipt_correction' ||
      input.inspectionMethod !== 'review_only' ||
      input.disposition !== 'receipt_zero_confirmed' ||
      input.inboundApproved ||
      input.qualifiedQuantity !== null ||
      input.unqualifiedQuantity !== null ||
      input.sampleQuantity !== null ||
      input.sampleUnqualifiedQuantity !== null
    ) {
      invalid('零数量仅允许实收更正的明确核实结论');
    }
    return { approvedQuantity: 0, qualityReturnQuantity: 0, undeterminedQuantity: 0 };
  }
  if (input.inspectionMethod === 'full') {
    if (
      input.qualifiedQuantity === null ||
      input.unqualifiedQuantity === null ||
      input.sampleQuantity !== null ||
      input.sampleUnqualifiedQuantity !== null
    )
      invalid('全检必须填写合格与不合格数量，不能填写样本数');
    requireQuantity(input.qualifiedQuantity!, '全检合格数量');
    requireQuantity(input.unqualifiedQuantity!, '全检不合格数量');
    if (input.qualifiedQuantity! + input.unqualifiedQuantity! !== coveredQuantity)
      invalid('全检数量必须覆盖本次全部实物');
    if (input.removedDefectQuantity > input.unqualifiedQuantity!)
      invalid('剔除不良不能超过全检不合格数量');
  } else if (input.inspectionMethod === 'sampling') {
    if (
      input.sampleQuantity === null ||
      input.sampleUnqualifiedQuantity === null ||
      input.qualifiedQuantity !== null ||
      input.unqualifiedQuantity !== null
    )
      invalid('抽检必须填写样本与样本不合格数，不能填写全检数量');
    requireQuantity(input.sampleQuantity!, '样本数量');
    requireQuantity(input.sampleUnqualifiedQuantity!, '样本不合格数量');
    if (
      input.sampleQuantity! < 1 ||
      input.sampleQuantity! > coveredQuantity ||
      input.sampleUnqualifiedQuantity! > input.sampleQuantity!
    )
      invalid('样本数量或样本不合格数量超出范围');
  } else invalid('非零数量必须记录真实全检或抽检');
  if (input.disposition === 'release') {
    if (!input.inboundApproved) invalid('放行必须明确批准入库');
    if (
      input.inspectionMethod === 'full' &&
      input.removedDefectQuantity !== input.unqualifiedQuantity
    )
      invalid('全检放行必须剔除全部已知不合格品');
    if (
      input.inspectionMethod === 'sampling' &&
      input.removedDefectQuantity < input.sampleUnqualifiedQuantity!
    )
      invalid('抽检放行不得遗漏已知样本不良');
    return {
      approvedQuantity: coveredQuantity - input.removedDefectQuantity,
      qualityReturnQuantity: input.removedDefectQuantity,
      undeterminedQuantity: 0,
    };
  }
  if (input.inboundApproved) invalid('只有放行处置可以批准入库');
  if (input.disposition === 'return_all')
    return { approvedQuantity: 0, qualityReturnQuantity: coveredQuantity, undeterminedQuantity: 0 };
  if (input.disposition === 'await_full_inspection' || input.disposition === 'await_decision') {
    return {
      approvedQuantity: 0,
      qualityReturnQuantity: input.removedDefectQuantity,
      undeterminedQuantity: coveredQuantity - input.removedDefectQuantity,
    };
  }
  return invalid('非零检验不能使用零数量核实处置');
}
