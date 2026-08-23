import type { BatchStepStatus } from '@company/contracts';
import { fixedIntegerQuantity, integerQuantity } from './integer-quantity.js';

const fixed = fixedIntegerQuantity;

export type RouteQuantityStep = {
  id: number | string;
  stepOrder: number;
  needRecord: boolean;
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
  requiredNormalQuantity: string;
  releasedInputQuantity: string;
  availableReportQuantity: string;
  remainingNormalQuantity: string;
  activatedSupplementInputQuantity: string;
  activatedSupplementTargetQuantity: string;
  pendingSupplementInputQuantity: string;
  isSupplementReopened: boolean;
  supplementBlockedReason: string | null;
  supplementSources: RouteSupplementSource[];
};

/**
 * Calculates route quantity gates from immutable reports and authorized scrap reproduction whose
 * material supplement has been fulfilled.
 * The returned values are projections; callers must never persist them as a second quantity fact.
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

  for (const [index, step] of ordered.entries()) {
    const affecting = supplements.filter((source) => source.sourceStepOrder >= step.stepOrder);
    const materialReady = affecting.filter((source) => source.status === 'material_ready');
    const downstreamActivated = materialReady.filter(
      (source) => source.sourceStepOrder > step.stepOrder,
    );
    const activatedInput = materialReady.reduce(
      (total, source) => total + integerQuantity(source.quantity),
      0,
    );
    const activatedTarget = downstreamActivated.reduce(
      (total, source) => total + integerQuantity(source.quantity),
      0,
    );
    const pendingInput = affecting
      .filter((source) => source.status === 'pending_material')
      .reduce((total, source) => total + integerQuantity(source.quantity), 0);
    const required = planned + activatedTarget;
    const previous = ordered[index - 1];
    const previousQuantity = previous ? result.get(String(previous.id)) : undefined;
    const released = !previous
      ? planned + activatedInput
      : previous.needRecord
        ? integerQuantity(previous.effectiveNormal)
        : previous.status === 'completed'
          ? integerQuantity(previousQuantity?.requiredNormalQuantity ?? 0)
          : 0;
    const directReported = integerQuantity(step.effectiveDirectReported);
    const effectiveNormal = integerQuantity(step.effectiveNormal);
    const available = Math.max(0, released - directReported);
    const remaining = Math.max(0, required - effectiveNormal);
    const isSupplementReopened =
      activatedTarget > 0 && step.status === 'doing' && effectiveNormal >= planned && remaining > 0;
    const supplementBlockedReason =
      index > 0 && activatedInput > 0 && remaining > 0 && available === 0
        ? '等待前道补产形成新的正常放行量'
        : null;

    result.set(String(step.id), {
      requiredNormalQuantity: fixed(required),
      releasedInputQuantity: fixed(released),
      availableReportQuantity: fixed(available),
      remainingNormalQuantity: fixed(remaining),
      activatedSupplementInputQuantity: fixed(activatedInput),
      activatedSupplementTargetQuantity: fixed(activatedTarget),
      pendingSupplementInputQuantity: fixed(pendingInput),
      isSupplementReopened,
      supplementBlockedReason,
      supplementSources: affecting,
    });
  }

  return result;
};
