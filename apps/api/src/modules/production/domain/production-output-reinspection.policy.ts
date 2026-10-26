import type {
  ProductionBatchStatus,
  ProductionOutputReceipts,
  ProductionOutputRound,
} from '@company/contracts';

interface OutputTarget {
  availableQuantity: number;
  extraQuantity: number;
}

export interface OutputReinspectionFacts {
  batchStatus: ProductionBatchStatus;
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
  const blockedReason = outputReinspectionBlockedReason(facts, remaining);
  return {
    canBeginReinspection: blockedReason === null,
    reinspectionBlockedReason: blockedReason,
    reinspectionRemainingQuantity: remaining === null ? null : String(Math.max(0, remaining)),
    receivedPlannedQuantity: facts.receipts.productionReceivedQuantity,
    receivedExtraQuantity: facts.receipts.extraReceivedQuantity,
  };
}

function outputReinspectionBlockedReason(
  facts: OutputReinspectionFacts,
  remaining: number | null,
): string | null {
  const round = facts.currentRound;
  if (!['closing', 'completed', 'terminated'].includes(facts.batchStatus))
    return '任务尚未进入结案阶段，不能办理成品复检';
  if (facts.hasPendingApproval) return '清单正在审批中，请先撤回或驳回';
  if (!facts.draft) return '请先保存产出草稿';
  if (!facts.hasInspection) return '当前尚无检验记录，请先完成首次检验';
  if (remaining !== null && remaining <= 0) return '当前批准清单已无剩余实物可复检';
  if (round?.status === 'inspecting') return '本轮检验正在填写，请继续登记结果';
  if (round?.status === 'pending_inspection' && round.triggerType !== 'finalization_correction')
    return '本轮检验尚未开始，请先完成当前轮次';
  if (round?.status === 'reviewing') return '清单正在审批中，请先撤回或驳回';
  if (
    round?.status === 'pending_finalization' ||
    round?.status === 'finalized' ||
    round?.status === 'superseded' ||
    (round?.status === 'pending_inspection' && round.triggerType === 'finalization_correction')
  )
    return null;
  return '当前轮次不能发起复检';
}
