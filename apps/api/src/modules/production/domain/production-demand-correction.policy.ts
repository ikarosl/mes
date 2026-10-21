import type {
  DemandBusinessStatus,
  DemandCloseCause,
  DemandCorrectionCheck,
  ProductionBatchStatus,
  SubmitDemandCorrectionPayload,
} from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';
import { fixedIntegerQuantity, integerQuantity } from './integer-quantity.js';
import {
  calculateUnifiedReportLimit,
  type RouteSupplementSource,
} from './production-route-quantity.policy.js';
import {
  evaluateSupplementFulfillment,
  type SupplementDemandRequirement,
} from './production-supplement-fulfillment.policy.js';

export interface DemandCorrectionEligibility {
  demandType: DemandCorrectionCheck['demandType'];
  businessStatus: DemandBusinessStatus;
  hasOtherPendingCorrection: boolean;
  batchStatus: ProductionBatchStatus;
  hasSupplement: boolean;
  supplementStatus: string | null;
  hasPendingOutbound: boolean;
  allocationStatuses: readonly string[];
  hasPendingLoss: boolean;
}

/** 资格输入由事务内当前事实提供；展示和批准复核共用同一组阻断规则。 */
export function demandCorrectionBlockers(facts: DemandCorrectionEligibility): string[] {
  const blockers: string[] = [];
  if (!['manual_additional', 'scrap_supplement'].includes(facts.demandType))
    blockers.push(
      facts.demandType === 'normal'
        ? '初始 BOM 需求不支持单条更正；停止生产时请走批次收尾'
        : '损耗补料需求依据已确认的损耗生成，不支持在此更正数量',
    );
  if (facts.businessStatus !== 'active')
    blockers.push(
      facts.businessStatus === 'fulfilled'
        ? '本需求已全部领料，没有待更正的未领数量'
        : '本需求已关闭或取消，不能再次更正',
    );
  if (facts.hasOtherPendingCorrection) blockers.push('该需求已有在审更正');
  if (
    ![
      'material_pending',
      'material_assigned',
      'material_partially_outbound',
      'material_outbound',
      'doing',
    ].includes(facts.batchStatus)
  )
    blockers.push('批次当前不允许更正需求');
  if (facts.hasSupplement && facts.supplementStatus !== 'approved')
    blockers.push('原补料单已完成领料或已取消，不能再更正其需求');
  if (facts.hasPendingOutbound)
    blockers.push('请先处理涉及本需求的待出库单；混合单须核对其他需求的领料安排');
  if (facts.allocationStatuses.some((status) => ['frozen', 'abnormal'].includes(status)))
    blockers.push('请先处理冻结或异常分配');
  if (facts.hasPendingLoss) blockers.push('请先处理本需求来源链的待确认损耗');
  return blockers;
}

export function demandCorrectionCloseCause(
  kind: SubmitDemandCorrectionPayload['kind'],
  newRemainingQuantity: number,
): Extract<DemandCloseCause, 'single_close' | 'correction_replaced' | 'correction_exhausted'> {
  return kind === 'close'
    ? 'single_close'
    : newRemainingQuantity > 0
      ? 'correction_replaced'
      : 'correction_exhausted';
}

/** 模拟当前需求关闭剩余量对既有补产授权的影响，不修改需求或授权事实。 */
export function evaluateZeroRemainderImpact(
  demandId: string,
  supplementId: string,
  issuedQuantity: number,
  plannedQuantity: string,
  requirements: readonly SupplementDemandRequirement[],
  sources: readonly RouteSupplementSource[],
): NonNullable<DemandCorrectionCheck['zeroRemainderImpact']> {
  const simulated = requirements.map((requirement) =>
    requirement.id !== demandId
      ? requirement
      : {
          ...requirement,
          status: 'closed' as const,
          pendingCorrectionId: null,
          closeCause: 'correction_exhausted' as const,
          correction: {
            applied: true,
            newDemandId: null,
            targetTotalQuantity: issuedQuantity,
            issuedQuantity,
            newRemainingQuantity: 0,
          },
        },
  );
  const readiness = evaluateSupplementFulfillment(simulated);
  const simulatedSources = sources.map((source) =>
    source.supplementId === supplementId && readiness.fulfilled
      ? { ...source, status: 'material_ready' as const }
      : source,
  );
  return {
    fulfillsSupplement: readiness.fulfilled,
    blockingDemandIds: readiness.blockingDemandIds,
    hasConfirmedIssue: simulated.some((requirement) => requirement.issuedQuantity > 0),
    activatedSupplementQuantity: fixedIntegerQuantity(
      sources
        .filter(
          (source) =>
            source.supplementId === supplementId &&
            source.status === 'pending_material' &&
            readiness.fulfilled,
        )
        .reduce((total, source) => integerQuantity(total + integerQuantity(source.quantity)), 0),
    ),
    upperLimitQuantity: calculateUnifiedReportLimit(plannedQuantity, simulatedSources),
  };
}

export function correctionRemaining(
  check: DemandCorrectionCheck,
  payload: SubmitDemandCorrectionPayload,
): number {
  if (!check.canCorrect)
    throw new ProductionDomainError('INVALID_STATE', check.blockers.join('；'));
  if (check.version !== payload.version || check.checkToken !== payload.checkToken)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '需求及关联事实已变化，请重新核对');
  if (!payload.reason.trim()) throw new ProductionDomainError('INVALID_INPUT', '请填写更正原因');
  const target = payload.targetTotalQuantity;
  if (!Number.isSafeInteger(target) || target < Number(check.issuedQuantity) || target > 99_999_999)
    throw new ProductionDomainError('INVALID_INPUT', '更正后总量必须是不少于链上累计已领量的整数');
  const remaining = target - Number(check.issuedQuantity);
  if (payload.kind === 'close' && (remaining !== 0 || check.demandType !== 'manual_additional'))
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '单条关闭仅适用于人工追加；补料须按更正数量明确解除剩余要求',
    );
  if (payload.kind === 'quantity' && target === Number(check.currentTotalQuantity))
    throw new ProductionDomainError('INVALID_INPUT', '更正后总量与当前要求相同');
  return remaining;
}
