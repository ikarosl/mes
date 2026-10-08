import type {
  ConfirmReceiptAcceptancePayload,
  QualityInboundCaseItem,
  QualityInboundInspectionItem,
  ReceiptAllocationInput,
  ReceiptRoundStatus,
} from '@company/contracts';
import { receiptError } from './procurement.errors.js';
import { allocateReceiptQuantities } from './receipt-allocation.policy.js';
import {
  summarizeReceiptInspectionExecution,
  suggestedReceiptInboundQuantity,
  type ReceiptInspectionAllocationFact,
} from './receipt-inspection-suggestion.policy.js';

export function requireReceiptAcceptanceState(input: {
  status: ReceiptRoundStatus;
  currentRevisionId: string;
  receiptRevisionId: string;
  physicalIdentityConfirmed: boolean;
}): { replaceRound: boolean } {
  if (
    !['awaiting_acceptance', 'finalized'].includes(input.status) ||
    input.currentRevisionId !== input.receiptRevisionId ||
    !input.physicalIdentityConfirmed
  )
    return receiptError('本轮尚不允许定稿，或实收版本已变化，请刷新', 'RECEIPT_STATE');
  return { replaceRound: input.status === 'finalized' };
}

export function requireReceiptAcceptanceInspection(
  review: QualityInboundCaseItem | null,
  input: { receiptLineId: string; inspectionId: string; roundInspectionId: string | null },
): { caseId: string; inspection: QualityInboundInspectionItem } {
  const inspection = review?.inspection;
  // A corrected allocation round may reuse this inspection; do not require the original case's round.
  if (
    !review ||
    review.status !== 'completed' ||
    review.receiptLineId !== input.receiptLineId ||
    !inspection ||
    inspection.id !== input.inspectionId ||
    input.roundInspectionId !== inspection.id ||
    inspection.releaseDecision !== 'released'
  )
    return receiptError(
      '必须引用本轮有效且明确放行的质检记录；待复检或不放行不能定为可入',
      'RECEIPT_STATE',
    );
  return { caseId: review.id, inspection };
}

export interface ReceiptAcceptanceQuantities {
  allocations: ReceiptAllocationInput[];
  confirmedQuantity: number;
  inboundQuantity: number;
  suggestion: number | null;
  overrideReason: string | null;
  remark: string;
}

export function evaluateReceiptAcceptanceQuantities(
  payload: ConfirmReceiptAcceptancePayload,
  inspection: QualityInboundInspectionItem,
  priorExecutions: readonly ReceiptInspectionAllocationFact[],
): ReceiptAcceptanceQuantities {
  const allocations = allocateReceiptQuantities(payload.details, payload.confirmedQuantity);
  const confirmedQuantity = payload.confirmedQuantity;
  const inboundQuantity = allocations
    .filter((a) => a.disposition === 'inbound')
    .reduce((sum, a) => sum + a.quantity, 0);
  const suggestion = suggestedReceiptInboundQuantity(
    {
      method: inspection.inspectionMethod,
      qualifiedQuantity: Number(inspection.qualifiedQuantity),
      unqualifiedQuantity: Number(inspection.unqualifiedQuantity),
    },
    confirmedQuantity,
    summarizeReceiptInspectionExecution(priorExecutions, inspection.id),
  );
  const overrideReason = payload.overrideReason?.trim() || null;
  if ((suggestion === null || inboundQuantity > suggestion) && !overrideReason)
    return receiptError('可入数量超过质检建议或样本与核实数量不一致，请填写数量异常核对依据');
  if (overrideReason && overrideReason.length > 2000)
    return receiptError('数量异常核对依据最多 2000 字');
  const remark = payload.remark.trim();
  if (!remark || remark.length > 2000) return receiptError('请填写核对说明，最多 2000 字');
  return { allocations, confirmedQuantity, inboundQuantity, suggestion, overrideReason, remark };
}

export function requireReceiptAcceptanceRemaining(
  status: ReceiptRoundStatus,
  remaining: number,
): void {
  if (status === 'finalized' && remaining === 0)
    return receiptError('本批已无未处置实物，不能恢复已入库或已退回数量', 'RECEIPT_STATE');
}
