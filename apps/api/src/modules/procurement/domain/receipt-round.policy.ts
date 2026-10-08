import type {
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityReleaseDecision,
  ReceiptRoundStatus,
  ReceiptRoundTrigger,
} from '@company/contracts';
import { receiptError } from './procurement.errors.js';
import { requireQuantity, type ReceiptBalance } from './receipt-quantity.policy.js';

export function requireReceiptNotRejected(trigger: ReceiptRoundTrigger): void {
  if (trigger === 'manual_rejection')
    receiptError('本轮已人工拒收，请先更正实收或撤销拒收重新办理', 'RECEIPT_STATE');
}

export function planReceiptReview(
  status: ReceiptRoundStatus,
  remaining: number,
  caseType: QualityInboundCaseType,
): { replaceRound: boolean } {
  if (status === 'reviewing' || remaining <= 0)
    return receiptError('本批正在检查或已无未处置实物', 'RECEIPT_STATE');
  if (caseType === 'initial' && status !== 'uninspected')
    return receiptError('已有检验结论，请使用复检或检验更正');
  return { replaceRound: status !== 'uninspected' };
}

export function requireReceiptCorrectionInput(input: {
  currentRevisionId: string;
  previousRevisionId: string;
  physicalIdentityConfirmed: boolean;
  receivedQuantity: number;
}): void {
  if (input.currentRevisionId !== input.previousRevisionId)
    return receiptError('实收修订已经变化，请刷新', 'RECEIPT_STATE');
  if (input.physicalIdentityConfirmed !== true)
    return receiptError('必须核实这是原到货实物的录入更正，不是新来货或损耗');
  requireQuantity(input.receivedQuantity, '更正后本次到货核实总量', true);
}

export function planReceiptCorrection(
  receivedQuantity: number,
  previousQuantity: number,
  balance: ReceiptBalance,
): { remaining: number; status: ReceiptRoundStatus } {
  if (receivedQuantity === previousQuantity) return receiptError('没有实收数量变化');
  if (receivedQuantity < balance.inbound + balance.returned)
    return receiptError('更正实收不能少于已实际入库及退回量');
  const remaining = receivedQuantity - balance.inbound - balance.returned;
  return { remaining, status: remaining === 0 ? 'finalized' : 'uninspected' };
}

export function requireReceiptRejection(remaining: number, reason: string): void {
  if (remaining <= 0) return receiptError('本批已无尚未处置实物', 'RECEIPT_STATE');
  if (!reason.trim()) return receiptError('请填写整批拒收原因');
}

export function requireRejectionRevocation(input: {
  trigger: ReceiptRoundTrigger;
  status: ReceiptRoundStatus;
  remaining: number;
  reason: string;
}): void {
  if (input.trigger !== 'manual_rejection' || input.status !== 'finalized' || input.remaining <= 0)
    return receiptError('只有当前人工拒收且仍有未处置实物，才能撤销拒收', 'RECEIPT_STATE');
  if (!input.reason.trim()) return receiptError('请填写撤销拒收原因');
}

export function requireReceiptInspecting(status: ReceiptRoundStatus): void {
  if (status !== 'reviewing')
    return receiptError('本轮已结束、拒收或被替代，请刷新', 'RECEIPT_STATE');
}

export function requireReceiptInspectionCase(
  review: QualityInboundCaseItem | null,
  input: {
    receiptLineId: string;
    roundId: string;
    receiptRevisionId: string;
    currentRevisionId: string;
  },
): QualityInboundCaseItem {
  if (
    !review ||
    review.status !== 'reviewing' ||
    review.receiptLineId !== input.receiptLineId ||
    review.roundId !== input.roundId ||
    review.receiptRevisionId !== input.receiptRevisionId ||
    input.currentRevisionId !== input.receiptRevisionId
  )
    return receiptError('检验办理与当前轮次或实收修订不匹配', 'RECEIPT_STATE');
  return review;
}

export function roundStatusAfterInspection(decision: QualityReleaseDecision): ReceiptRoundStatus {
  return decision === 'released'
    ? 'awaiting_acceptance'
    : decision === 'pending_reinspection'
      ? 'reinspection_required'
      : 'quality_rejected';
}

/** A finalized empty round clears older ownership; review rounds only carry their explicit basis. */
export function nextReceiptAllocationSourceRoundId(
  previous: {
    id: string;
    status: ReceiptRoundStatus;
    sourceAllocationRoundId: string | null;
  } | null,
  hasAllocations: boolean,
): string | null {
  if (!previous) return null;
  return previous.status === 'finalized'
    ? hasAllocations
      ? previous.id
      : null
    : previous.sourceAllocationRoundId;
}
