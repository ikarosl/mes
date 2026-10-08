import type { ProductionOutputReceipts, ProductionOutputRound } from '@company/contracts';

interface OutputTarget {
  availableQuantity: number;
  extraQuantity: number;
}

export interface OutputReinspectionFacts {
  hasPendingApproval: boolean;
  hasCorrection: boolean;
  draft: OutputTarget | null;
  approved: OutputTarget | null;
  hasInspection: boolean;
  currentRound: Pick<ProductionOutputRound, 'status' | 'triggerType'> | null;
  receipts: ProductionOutputReceipts;
}

export interface OutputReinspectionPreview {
  canBeginReinspection: boolean;
  reinspectionBlockedReason: string | null;
  reinspectionRemainingQuantity: string | null;
  receivedPlannedQuantity: string;
  receivedExtraQuantity: string;
}

/** 展示与锁内命令共用规则；调用者负责提供本次读取的事实，不能复用跨请求的预览。 */
export function evaluateOutputReinspection(
  facts: OutputReinspectionFacts,
): OutputReinspectionPreview {
  const target = facts.hasCorrection && facts.draft ? facts.draft : (facts.approved ?? facts.draft);
  const remaining = target
    ? target.availableQuantity +
      target.extraQuantity -
      Number(facts.receipts.productionReceivedQuantity) -
      Number(facts.receipts.extraReceivedQuantity)
    : null;
  const round = facts.currentRound;
  const blockedReason = facts.hasPendingApproval
    ? '清单正在审批中，请先撤回或驳回'
    : !facts.draft
      ? '请先保存产出草稿'
      : !facts.hasInspection
        ? '当前尚无检验记录，请先完成首次检验'
        : remaining !== null && remaining <= 0
          ? '当前批准清单已无剩余实物可复检'
          : round?.status === 'inspecting'
            ? '本轮检验正在填写，请继续登记结果'
            : round?.status === 'pending_inspection' &&
                round.triggerType !== 'finalization_correction'
              ? '本轮检验尚未开始，请先完成当前轮次'
              : round?.status === 'reviewing'
                ? '清单正在审批中，请先撤回或驳回'
                : round?.status === 'pending_finalization' ||
                    round?.status === 'finalized' ||
                    round?.status === 'superseded' ||
                    (round?.status === 'pending_inspection' &&
                      round.triggerType === 'finalization_correction')
                  ? null
                  : '当前轮次不能发起复检';
  return {
    canBeginReinspection: blockedReason === null,
    reinspectionBlockedReason: blockedReason,
    reinspectionRemainingQuantity: remaining === null ? null : String(Math.max(0, remaining)),
    receivedPlannedQuantity: facts.receipts.productionReceivedQuantity,
    receivedExtraQuantity: facts.receipts.extraReceivedQuantity,
  };
}
