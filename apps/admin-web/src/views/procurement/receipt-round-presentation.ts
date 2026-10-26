import {
  RECEIPT_ALLOCATION_EXECUTION_LABELS,
  RECEIPT_LINE_STAGE_LABELS,
  RECEIPT_ROUND_STATUS_LABELS,
} from '@company/constants';
import type {
  ProcurementInboundInspectionDetail,
  ProcurementReceiptLine,
  ProcurementReceiptLineIndexItem,
  ReceiptAllocationDisposition,
  ReceiptAllocationItem,
  ReceiptLineStage,
  ReceiptRoundStatus,
} from '@company/contracts';

export type ReceiptDetailIntent =
  'acceptance' | 'correct' | 'reject' | 'revoke' | 'allocations' | 'history' | 'void';

type ReceiptRoundSummary = {
  void?: ProcurementReceiptLine['void'];
  currentRound: Pick<ProcurementReceiptLine['currentRound'], 'status' | 'triggerType'>;
  quantities: Pick<ProcurementReceiptLine['quantities'], 'unprocessedQuantity'>;
};
type ReceiptStageSummary =
  | (ReceiptRoundSummary & { stage?: ReceiptLineStage })
  | Pick<ProcurementReceiptLineIndexItem, 'stage'>;
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
  voided: { type: 'danger', effect: 'plain' },
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
export const receiptReturnQuantityClass = (
  value: string | number | null | undefined,
): 'quantity-return' | 'quantity-zero' | undefined => {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return undefined;
  return quantity === 0 ? 'quantity-zero' : 'quantity-return';
};
export const receiptRoundTagType = (status: ReceiptRoundStatus): TagAppearance['type'] =>
  ROUND_TAGS[status].type;
export const receiptRoundTagEffect = (status: ReceiptRoundStatus): TagAppearance['effect'] =>
  ROUND_TAGS[status].effect;

export const isReceiptRejected = (line: ReceiptRoundSummary): boolean =>
  line.currentRound.triggerType === 'manual_rejection';
export const isReceiptVoided = (
  line: Pick<ReceiptRoundSummary, 'currentRound' | 'void'>,
): boolean => Boolean(line.void) || line.currentRound.status === 'voided';
export const canRevokeReceiptRejection = (line: ReceiptRoundSummary): boolean =>
  !isReceiptVoided(line) &&
  isReceiptRejected(line) &&
  line.currentRound.status === 'finalized' &&
  Number(line.quantities.unprocessedQuantity) > 0;
export const canReviewReceipt = (line: ReceiptRoundSummary): boolean =>
  !isReceiptVoided(line) &&
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
  !isReceiptVoided(line) &&
  !isReceiptRejected(line) &&
  Number(line.quantities.unprocessedQuantity) > 0 &&
  ['awaiting_acceptance', 'finalized'].includes(line.currentRound.status) &&
  !!line.currentRound.inspectionId;
export const canRejectReceipt = (line: ReceiptRoundSummary): boolean =>
  !isReceiptVoided(line) &&
  !isReceiptRejected(line) &&
  Number(line.quantities.unprocessedQuantity) > 0;
const receiptLineStage = (line: ReceiptStageSummary): ReceiptLineStage | 'superseded' => {
  if (!('currentRound' in line)) return line.stage;
  if (isReceiptVoided(line)) return 'voided';
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

type ReceiptFlowTone = 'neutral' | 'primary' | 'warning' | 'danger' | 'success';
interface ReceiptFlowStep {
  label: string;
  detail: string;
  tone: ReceiptFlowTone;
}
interface ReceiptProcessingGuide {
  tone: ReceiptFlowTone;
  nextStep: string;
  note: string;
  steps: ReceiptFlowStep[];
}
/** 仅解释当前轮，不从历史检查或分配推断当前执行资格。 */
export const receiptProcessingGuide = (line: ProcurementReceiptLine): ReceiptProcessingGuide => {
  if (isReceiptVoided(line))
    return {
      tone: 'danger',
      nextStep: '到货登记已作废，仅可查看原始登记、检验和正式清单历史。',
      note: '未执行授权已失效；采购状态保持不变，需要继续收货时应重新登记实际到货。',
      steps: [
        { label: '登记到货', detail: '原始记录保留', tone: 'neutral' },
        { label: '检验与清单', detail: '历史依据保留', tone: 'neutral' },
        { label: '整单作废', detail: '停止后续办理', tone: 'danger' },
      ],
    };
  const stage = receiptLineStage(line);
  const completed = stage === 'completed' && isKnownZero(line.quantities.unprocessedQuantity);
  const rejected = isReceiptRejected(line);
  const finalized = line.currentRound.status === 'finalized';
  const inbound = Number(line.quantities.pendingInboundQuantity) > 0;
  const returned = Number(line.quantities.pendingReturnQuantity) > 0;
  const undetermined = Number(line.quantities.undeterminedQuantity) > 0;
  const inspected =
    !rejected &&
    !!line.currentRound.inspectionId &&
    ['awaiting_acceptance', 'finalized'].includes(line.currentRound.status);
  let inspectionTone: ReceiptFlowTone = 'neutral';
  if (stage === 'quality_rejected') inspectionTone = 'danger';
  else if (stage === 'reinspection_required') inspectionTone = 'warning';
  else if (['uninspected', 'reviewing'].includes(stage)) inspectionTone = 'primary';
  let finalizedNextStep = '请核对本轮数量和入库、退回安排。';
  if (undetermined) {
    finalizedNextStep = '先核对待处理数量的安排；已有入库、退回待办可分别办理。';
  } else if (inbound && returned) {
    finalizedNextStep = '按有效分配分别办理入库和退回，两者可并行。';
  } else if (inbound) {
    finalizedNextStep = '前往入库，按有效分配确认实际入库。';
  } else if (returned) {
    finalizedNextStep = '选择下方有效待退分配，核对交接后确认退回。';
  }
  const nextSteps: Record<ReceiptLineStage | 'superseded', string> = {
    uninspected: '前往来料检验，发起本轮整批检查。',
    reviewing: '继续本轮来料检验，填写检查结果与放行结论。',
    reinspection_required: '前往来料检验办理复检，放行后重新由仓库确认。',
    quality_rejected: '本轮未放行，请核对检验结果后办理复检或人工拒收。',
    awaiting_acceptance: '由仓库核对数量和入库、退回安排。',
    finalized: finalizedNextStep,
    manual_rejection: '选择下方有效待退分配，核对交接凭据后确认退回。',
    completed: '当前无需继续入库或退回；同批计数有误时可更正到货量。',
    superseded: '请刷新明细，核对最新处理轮次。',
    voided: '到货登记已作废，历史记录仅供追溯。',
  };
  let tone: ReceiptFlowTone = 'primary';
  if (completed) tone = 'success';
  else if (['manual_rejection', 'quality_rejected'].includes(stage)) tone = 'danger';
  else if (
    stage === 'reinspection_required' ||
    stage === 'awaiting_acceptance' ||
    (finalized && (undetermined || (!inbound && returned)))
  ) {
    tone = 'warning';
  }
  let nextStep = nextSteps[stage];
  if (
    !line.quantities.unprocessedQuantity.trim() ||
    !Number.isFinite(Number(line.quantities.unprocessedQuantity))
  ) {
    tone = 'warning';
    nextStep = '尚未入库或退回的数量待核对，请刷新明细后再办理。';
  }
  const finish: ReceiptFlowStep = {
    label: '处理完成',
    detail: completed ? '本批无剩余实物' : '实际入库、退回后核对',
    tone: completed ? 'success' : 'neutral',
  };
  const registration: ReceiptFlowStep = { label: '登记到货', detail: '已登记', tone: 'neutral' };
  if (rejected)
    return {
      tone,
      nextStep,
      note: '人工拒收直接安排退回，不经过来料检验与正常定稿。',
      steps: [
        registration,
        { label: '人工拒收', detail: '已安排待退', tone: completed ? 'neutral' : 'danger' },
        {
          label: '实际退回',
          detail: completed ? '本批已无待退' : '核对分配与交接',
          tone: completed ? 'neutral' : 'warning',
        },
        finish,
      ],
    };
  const repeatInspection = !inspected && !completed && line.currentRound.triggerType !== 'receipt';
  let inspectionDetail: string;
  if (inspected) inspectionDetail = '已引用放行记录';
  else if (completed) inspectionDetail = '以本轮记录为准';
  else inspectionDetail = receiptLineStageLabel(line);
  let warehouseDetail = '核对数量与处理安排';
  if (finalized && line.allocations.length) warehouseDetail = '已形成正式分配';
  else if (completed) warehouseDetail = '本轮无待办';
  let executionDetail = '仓库确认后按分配办理';
  if (completed) executionDetail = '实际入退见累计';
  else if (finalized) {
    if (inbound && returned) executionDetail = '入库与退回并行';
    else if (inbound) executionDetail = '有待入库';
    else if (returned) executionDetail = '有待退回';
    else executionDetail = '仍待明确去向';
  }
  let executionTone: ReceiptFlowTone = 'neutral';
  if (!completed && finalized) {
    if (undetermined || !inbound) executionTone = 'warning';
    else executionTone = 'primary';
  }
  return {
    tone,
    nextStep,
    note: repeatInspection
      ? '本轮须重新经过检验与仓库确认，旧分配不能继续执行；已入库、已退回累计不变。'
      : '入库与退回按正式分配分别办理，并非每批都需要两种操作。',
    steps: [
      registration,
      {
        label: '来料检验',
        detail: inspectionDetail,
        tone: inspectionTone,
      },
      {
        label: '仓库确认',
        detail: warehouseDetail,
        tone: stage === 'awaiting_acceptance' ? 'warning' : 'neutral',
      },
      {
        label: '入库 / 退回',
        detail: executionDetail,
        tone: executionTone,
      },
      finish,
    ],
  };
};
export const currentReceiptCase = (
  line: Pick<ProcurementInboundInspectionDetail, 'currentRound' | 'cases'>,
) =>
  line.currentRound.status === 'voided'
    ? undefined
    : line.cases.find(
        (record) => record.roundId === line.currentRound.id && record.status === 'reviewing',
      );

export const canExecuteReceiptAllocation = (
  line: ProcurementReceiptLine,
  allocation: ReceiptAllocationItem,
): boolean =>
  !isReceiptVoided(line) &&
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
  if (isReceiptVoided(line)) return 'superseded';
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
