import type { BatchStepStatus } from '@company/contracts';
import { fixedIntegerQuantity, integerQuantity } from './integer-quantity.js';

const fixed = fixedIntegerQuantity;

export type RouteQuantityStep = {
  id: number | string;
  stepOrder: number;
  status: BatchStepStatus;
  effectiveDirectReported: number | string;
  effectiveNormal: number | string;
};

export type RouteSupplementSource = {
  scrapRecordId: string;
  supplementId: string;
  sourceStepRecordId: string;
  sourceStepOrder: number;
  sourceStepCode: string;
  sourceStepName: string;
  quantity: string;
  status: 'pending_material' | 'material_ready';
};

export type RouteStepQuantity = {
  /** 计划量加全路线已履约补产授权，各道工序统一使用。 */
  upperLimitQuantity: string;
  /** 计划量加本工序之后的已履约补产授权，只作路径建议目标。 */
  requiredNormalQuantity: string;
  availableReportQuantity: string;
  remainingNormalQuantity: string;
  previousStepNormalQuantity: string | null;
  directReportedVsPreviousNormalDifference: string | null;
  normalVsPreviousNormalDifference: string | null;
  normalVsTargetDifference: string;
  /** 全路线已履约补产授权数量，是统一投入上限的增量。 */
  activatedSupplementInputQuantity: string;
  /** 本工序之后的已履约补产授权数量，是建议正常目标的增量。 */
  activatedSupplementTargetQuantity: string;
  /** 全路线待履约补产授权数量，尚不计入统一投入上限。 */
  pendingSupplementInputQuantity: string;
  /** 全路线补产授权来源，包含已履约和待履约来源。 */
  supplementSources: RouteSupplementSource[];
};

export const calculateUnifiedReportLimit = (
  plannedQuantity: number | string,
  supplements: readonly RouteSupplementSource[],
): string =>
  fixed(
    integerQuantity(plannedQuantity) +
      supplements
        .filter((source) => source.status === 'material_ready')
        .reduce((total, source) => integerQuantity(total + integerQuantity(source.quantity)), 0),
  );

/**
 * 根据不可变报工及已履约补产授权计算统一上限、路线目标和差异。
 * 返回值是汇总投影，调用方不得将其作为第二份数量事实持久化。
 */
export const calculateRouteStepQuantities = (
  plannedQuantity: number | string,
  steps: RouteQuantityStep[],
  supplements: RouteSupplementSource[],
): Map<string, RouteStepQuantity> => {
  const planned = integerQuantity(plannedQuantity);
  const ordered = [...steps].sort(
    (left, right) =>
      left.stepOrder - right.stepOrder || String(left.id).localeCompare(String(right.id)),
  );
  const result = new Map<string, RouteStepQuantity>();
  const upperLimit = integerQuantity(calculateUnifiedReportLimit(planned, supplements));
  const materialReady = supplements.filter((source) => source.status === 'material_ready');
  const activatedInput = materialReady.reduce(
    (total, source) => integerQuantity(total + integerQuantity(source.quantity)),
    0,
  );
  const pendingInput = supplements
    .filter((source) => source.status === 'pending_material')
    .reduce((total, source) => integerQuantity(total + integerQuantity(source.quantity)), 0);

  for (const [index, step] of ordered.entries()) {
    const downstreamActivated = materialReady.filter(
      (source) => source.sourceStepOrder > step.stepOrder,
    );
    const activatedTarget = downstreamActivated.reduce(
      (total, source) => integerQuantity(total + integerQuantity(source.quantity)),
      0,
    );
    const required = integerQuantity(planned + activatedTarget);
    const previous = ordered[index - 1];
    const previousNormal = previous ? integerQuantity(previous.effectiveNormal) : null;
    const directReported = integerQuantity(step.effectiveDirectReported);
    const effectiveNormal = integerQuantity(step.effectiveNormal);
    const available = Math.max(0, upperLimit - directReported);
    const remaining = Math.max(0, required - effectiveNormal);
    result.set(String(step.id), {
      upperLimitQuantity: fixed(upperLimit),
      requiredNormalQuantity: fixed(required),
      availableReportQuantity: fixed(available),
      remainingNormalQuantity: fixed(remaining),
      previousStepNormalQuantity: previousNormal === null ? null : fixed(previousNormal),
      directReportedVsPreviousNormalDifference:
        previousNormal === null ? null : fixed(directReported - previousNormal),
      normalVsPreviousNormalDifference:
        previousNormal === null ? null : fixed(effectiveNormal - previousNormal),
      normalVsTargetDifference: fixed(effectiveNormal - required),
      activatedSupplementInputQuantity: fixed(activatedInput),
      activatedSupplementTargetQuantity: fixed(activatedTarget),
      pendingSupplementInputQuantity: fixed(pendingInput),
      supplementSources: supplements,
    });
  }

  return result;
};
