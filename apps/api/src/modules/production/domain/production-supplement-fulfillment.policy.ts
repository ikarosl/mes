import type { DemandBusinessStatus, DemandCloseCause } from '@company/contracts';

export interface SupplementDemandRequirement {
  id: string;
  status: DemandBusinessStatus;
  pendingCorrectionId: string | null;
  replacesDemandId: string | null;
  closeCause: DemandCloseCause | null;
  issuedQuantity: number;
  correction: null | {
    applied: boolean;
    newDemandId: string | null;
    targetTotalQuantity: number;
    issuedQuantity: number;
    newRemainingQuantity: number;
  };
}

/** 每个历史要求都须有真实履约或已生效的承接依据；空集合与普通关闭不能视为齐套。 */
export function evaluateSupplementFulfillment(demands: readonly SupplementDemandRequirement[]): {
  fulfilled: boolean;
  blockingDemandIds: string[];
} {
  const byId = new Map(demands.map((demand) => [demand.id, demand]));
  const blockingDemandIds = demands
    .filter((demand) => {
      if (demand.pendingCorrectionId) return true;
      if (demand.replacesDemandId) {
        const predecessor = byId.get(demand.replacesDemandId);
        if (
          predecessor?.status !== 'closed' ||
          predecessor.closeCause !== 'correction_replaced' ||
          !predecessor.correction?.applied ||
          predecessor.correction.newDemandId !== demand.id
        )
          return true;
      }
      if (demand.status === 'fulfilled') return false;
      const correction = demand.correction;
      if (demand.status !== 'closed' || !correction?.applied) return true;
      if (demand.closeCause === 'correction_replaced') {
        const successor = correction.newDemandId ? byId.get(correction.newDemandId) : undefined;
        return (
          !successor ||
          successor.replacesDemandId !== demand.id ||
          correction.newRemainingQuantity <= 0
        );
      }
      return !(
        demand.closeCause === 'correction_exhausted' &&
        correction.newDemandId === null &&
        correction.newRemainingQuantity === 0 &&
        correction.targetTotalQuantity === correction.issuedQuantity
      );
    })
    .map((demand) => demand.id);
  return {
    fulfilled:
      demands.length > 0 &&
      blockingDemandIds.length === 0 &&
      demands.some((demand) => demand.issuedQuantity > 0),
    blockingDemandIds,
  };
}
