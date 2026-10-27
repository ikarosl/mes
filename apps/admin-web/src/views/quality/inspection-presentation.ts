import type {
  FinishedInspectionStage,
  FinishedInspectionTaskItem,
  ProcurementInboundInspectionDetail,
  ProductionOutputRoundStatus,
  QualityInboundCaseItem,
} from '@company/contracts';

type RoundTagAppearance = {
  type: 'primary' | 'success' | 'warning' | 'info';
  effect: 'light' | 'plain';
};

const FINISHED_ROUND_TAGS: Record<ProductionOutputRoundStatus, RoundTagAppearance> = {
  pending_inspection: { type: 'info', effect: 'light' },
  inspecting: { type: 'primary', effect: 'light' },
  pending_finalization: { type: 'warning', effect: 'light' },
  reviewing: { type: 'primary', effect: 'plain' },
  finalized: { type: 'success', effect: 'plain' },
  superseded: { type: 'info', effect: 'plain' },
};

export const finishedRoundTagType = (
  status: ProductionOutputRoundStatus,
): RoundTagAppearance['type'] => FINISHED_ROUND_TAGS[status].type;
export const finishedRoundTagEffect = (
  status: ProductionOutputRoundStatus,
): RoundTagAppearance['effect'] => FINISHED_ROUND_TAGS[status].effect;

const FINISHED_STAGE_TAGS: Record<
  FinishedInspectionStage,
  'primary' | 'success' | 'warning' | 'danger' | 'info'
> = {
  awaiting_draft: 'info',
  awaiting_start: 'info',
  inspecting: 'primary',
  needs_reinspection: 'warning',
  not_released: 'danger',
  ready_for_finalization: 'warning',
  reviewing: 'primary',
  approved: 'success',
  blocked: 'danger',
};

export const finishedStageTagType = (stage: FinishedInspectionStage) => FINISHED_STAGE_TAGS[stage];

const readScopeQuantity = (value: string | null): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
};

/** 只用同一轮固定快照还原起始申报，不混用后续草稿和实时已入量。 */
export function finishedInspectionQuantityFormula(
  task: Pick<
    FinishedInspectionTaskItem,
    'startingDeclaredRemaining' | 'baselinePlannedReceived' | 'baselineExtraReceived'
  >,
  unit: string,
): string | null {
  const remaining = readScopeQuantity(task.startingDeclaredRemaining);
  const plannedReceived = readScopeQuantity(task.baselinePlannedReceived);
  const extraReceived = readScopeQuantity(task.baselineExtraReceived);
  if (remaining === null || plannedReceived === null || extraReceived === null) return null;
  const received = plannedReceived + extraReceived;
  const declared = remaining + received;
  if (!Number.isSafeInteger(declared)) return null;
  return `申报 ${declared} ${unit} − 已入库 ${received} ${unit}`;
}

/** 当前余额可解释在途送检范围；旧轮或旧修订的送检快照不能套用当前算式。 */
export function incomingInspectionQuantityFormula(
  source: Pick<
    ProcurementInboundInspectionDetail,
    'id' | 'currentReceiptRevisionId' | 'currentRound' | 'quantities' | 'unit' | 'void'
  >,
  inspectionCase: QualityInboundCaseItem | null,
): string | null {
  if (source.void) return null;
  const received = readScopeQuantity(source.quantities.receivedQuantity);
  const inbound = readScopeQuantity(source.quantities.inboundQuantity);
  const returned = readScopeQuantity(source.quantities.returnedQuantity);
  const remaining = readScopeQuantity(source.quantities.unprocessedQuantity);
  if (
    received === null ||
    inbound === null ||
    returned === null ||
    remaining === null ||
    received - inbound - returned !== remaining
  )
    return null;
  if (
    inspectionCase?.status === 'reviewing' &&
    (inspectionCase.receiptLineId !== source.id ||
      inspectionCase.roundId !== source.currentRound.id ||
      inspectionCase.receiptRevisionId !== source.currentReceiptRevisionId ||
      readScopeQuantity(inspectionCase.coveredQuantity) !== remaining)
  )
    return null;
  return `实收 ${received} ${source.unit} − 已入库 ${inbound} ${source.unit} − 已退回 ${returned} ${source.unit}`;
}
