import { MATERIAL_OUTBOUND_BLOCKED_LABELS } from '@company/constants';
import type { MaterialOutboundEligibility, ProductionBatchStatus } from '@company/contracts';
import { MATERIAL_OPERATION_BATCH_STATUSES } from './production-material.policy.js';

export interface MaterialOutboundEligibilityContext {
  batchStatus: ProductionBatchStatus;
  hasActiveAllocation: boolean;
  hasOrderableAllocation: boolean;
}

const blocked = (
  code: Exclude<MaterialOutboundEligibility['blockedCode'], null>,
): MaterialOutboundEligibility => ({
  eligible: false,
  blockedCode: code,
  blockedReason: MATERIAL_OUTBOUND_BLOCKED_LABELS[code],
});

/** 出库候选展示当前分配资格；写事务仍在锁内重新校验需求、分配和库存。 */
export const evaluateMaterialOutboundEligibility = (
  context: MaterialOutboundEligibilityContext,
): MaterialOutboundEligibility => {
  if (!MATERIAL_OPERATION_BATCH_STATUSES.includes(context.batchStatus))
    return blocked('allocation_incomplete');
  if (!context.hasOrderableAllocation)
    return blocked(
      context.hasActiveAllocation ? 'no_orderable_allocation' : 'allocation_incomplete',
    );
  return { eligible: true, blockedCode: null, blockedReason: null };
};
