import {
  RECEIPT_ALLOCATION_EXECUTION_LABELS,
  RECEIPT_LINE_STAGE_LABELS,
  RECEIPT_ROUND_STATUS_LABELS,
} from '@company/constants';
import type {
  ProcurementReceiptLine,
  ReceiptAllocationDisposition,
  ReceiptAllocationItem,
  ReceiptLineStage,
  ReceiptRoundStatus,
} from '@company/contracts';

export type ReceiptDetailIntent =
  'acceptance' | 'correct' | 'reject' | 'revoke' | 'allocations' | 'history';

type ReceiptRoundSummary = {
  currentRound: Pick<ProcurementReceiptLine['currentRound'], 'status' | 'triggerType'>;
  quantities: Pick<ProcurementReceiptLine['quantities'], 'unprocessedQuantity'>;
};
type ReceiptStageSummary = ReceiptRoundSummary & { stage?: ReceiptLineStage };
type TagAppearance = {
  type: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  effect: 'light' | 'plain';
};
const ROUND_TAGS: Record<ReceiptRoundStatus, TagAppearance> = {
  uninspected: { type: 'info', effect: 'light' },
  reviewing: { type: 'primary', effect: 'light' },
  reinspection_required: { type: 'warning', effect: 'plain' },
  quality_rejected: { type: 'danger', effect: 'light' },
  awaiting_acceptance: { type: 'warning', effect: 'light' },
  finalized: { type: 'success', effect: 'plain' },
  superseded: { type: 'info', effect: 'plain' },
};
const LINE_STAGE_TAGS: Record<ReceiptLineStage, TagAppearance> = {
  ...ROUND_TAGS,
  manual_rejection: { type: 'danger', effect: 'plain' },
  completed: { type: 'success', effect: 'light' },
};
const ALLOCATION_AUTHORIZATION_TAGS: Record<ReceiptAllocationDisposition, TagAppearance> = {
  inbound: { type: 'primary', effect: 'light' },
  return: { type: 'warning', effect: 'light' },
  pending: { type: 'info', effect: 'plain' },
};
export const receiptAllocationAuthorizationTag = (
  disposition: ReceiptAllocationDisposition,
): TagAppearance => ALLOCATION_AUTHORIZATION_TAGS[disposition];
const isKnownZero = (value: string): boolean => value.trim() !== '' && Number(value) === 0;
export const receiptRoundTagType = (status: ReceiptRoundStatus): TagAppearance['type'] =>
  ROUND_TAGS[status].type;
export const receiptRoundTagEffect = (status: ReceiptRoundStatus): TagAppearance['effect'] =>
  ROUND_TAGS[status].effect;

export const isReceiptRejected = (line: ReceiptRoundSummary): boolean =>
  line.currentRound.triggerType === 'manual_rejection';
export const canRevokeReceiptRejection = (line: ReceiptRoundSummary): boolean =>
  isReceiptRejected(line) &&
  line.currentRound.status === 'finalized' &&
  Number(line.quantities.unprocessedQuantity) > 0;
export const canReviewReceipt = (line: ReceiptRoundSummary): boolean =>
  !isReceiptRejected(line) &&
  Number(line.quantities.unprocessedQuantity) > 0 &&
  [
    'uninspected',
    'reinspection_required',
    'quality_rejected',
    'awaiting_acceptance',
    'finalized',
  ].includes(line.currentRound.status);
export const canAcceptReceipt = (
  line: ReceiptRoundSummary & {
    currentRound: Pick<ProcurementReceiptLine['currentRound'], 'inspectionId'>;
  },
): boolean =>
  !isReceiptRejected(line) &&
  Number(line.quantities.unprocessedQuantity) > 0 &&
  ['awaiting_acceptance', 'finalized'].includes(line.currentRound.status) &&
  !!line.currentRound.inspectionId;
export const canRejectReceipt = (line: ReceiptRoundSummary): boolean =>
  !isReceiptRejected(line) && Number(line.quantities.unprocessedQuantity) > 0;
const receiptLineStage = (line: ReceiptStageSummary): ReceiptLineStage | 'superseded' => {
  if (line.stage) return line.stage;
  if (isKnownZero(line.quantities.unprocessedQuantity)) return 'completed';
  if (isReceiptRejected(line)) return 'manual_rejection';
  return line.currentRound.status;
};
const receiptLineStageTag = (line: ReceiptStageSummary): TagAppearance => {
  const stage = receiptLineStage(line);
  return stage === 'superseded' ? ROUND_TAGS.superseded : LINE_STAGE_TAGS[stage];
};
export const receiptLineStageLabel = (line: ReceiptStageSummary): string => {
  const stage = receiptLineStage(line);
  return stage === 'superseded'
    ? RECEIPT_ROUND_STATUS_LABELS.superseded
    : RECEIPT_LINE_STAGE_LABELS[stage];
};
export const receiptLineStageType = (line: ReceiptStageSummary): TagAppearance['type'] =>
  receiptLineStageTag(line).type;
export const receiptLineStageEffect = (line: ReceiptStageSummary): TagAppearance['effect'] =>
  receiptLineStageTag(line).effect;
export const currentReceiptCase = (line: Pick<ProcurementReceiptLine, 'currentRound' | 'cases'>) =>
  line.cases.find(
    (record) => record.roundId === line.currentRound.id && record.status === 'reviewing',
  );

export const canExecuteReceiptAllocation = (
  line: ProcurementReceiptLine,
  allocation: ReceiptAllocationItem,
): boolean =>
  allocation.isCurrent &&
  allocation.roundId === line.currentRound.id &&
  line.currentRound.status === 'finalized' &&
  Number(allocation.remainingQuantity) > 0 &&
  (allocation.disposition === 'return' ||
    (allocation.disposition === 'inbound' &&
      !allocation.terminationReason &&
      !isReceiptRejected(line)));

type AllocationExecutionStatus = keyof typeof RECEIPT_ALLOCATION_EXECUTION_LABELS;
const ALLOCATION_EXECUTION_TAGS: Record<AllocationExecutionStatus, TagAppearance> = {
  pending_inbound: { type: 'primary', effect: 'light' },
  partially_inbound: { type: 'primary', effect: 'plain' },
  inbound_completed: { type: 'success', effect: 'light' },
  pending_return: { type: 'warning', effect: 'light' },
  partially_returned: { type: 'warning', effect: 'plain' },
  return_completed: { type: 'success', effect: 'light' },
  pending: { type: 'warning', effect: 'plain' },
  superseded: { type: 'info', effect: 'plain' },
  blocked: { type: 'danger', effect: 'plain' },
};
const receiptAllocationExecutionStatus = (
  line: ProcurementReceiptLine,
  allocation: ReceiptAllocationItem,
): AllocationExecutionStatus => {
  // 已完成物流事实不会因后续整批轮次失效而变回待办。
  if (
    allocation.disposition === 'inbound' &&
    Number(allocation.inboundQuantity) >= Number(allocation.quantity)
  )
    return 'inbound_completed';
  if (
    allocation.disposition === 'return' &&
    Number(allocation.returnedQuantity) >= Number(allocation.quantity)
  )
    return 'return_completed';
  if (!allocation.isCurrent || allocation.roundId !== line.currentRound.id) return 'superseded';
  if (line.currentRound.status !== 'finalized') return 'blocked';
  if (allocation.disposition === 'pending') return 'pending';
  if (!canExecuteReceiptAllocation(line, allocation)) return 'blocked';
  if (allocation.disposition === 'inbound')
    return Number(allocation.inboundQuantity) > 0 ? 'partially_inbound' : 'pending_inbound';
  return Number(allocation.returnedQuantity) > 0 ? 'partially_returned' : 'pending_return';
};
export const receiptAllocationExecutionLabel = (
  line: ProcurementReceiptLine,
  allocation: ReceiptAllocationItem,
): string =>
  RECEIPT_ALLOCATION_EXECUTION_LABELS[receiptAllocationExecutionStatus(line, allocation)];
export const receiptAllocationExecutionTag = (
  line: ProcurementReceiptLine,
  allocation: ReceiptAllocationItem,
): TagAppearance => ALLOCATION_EXECUTION_TAGS[receiptAllocationExecutionStatus(line, allocation)];
