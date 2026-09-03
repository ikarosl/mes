import type { ProductionBatchStatus } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

const ALLOCATION_BATCH_STATUSES: readonly ProductionBatchStatus[] = [
  'material_pending',
  'material_assigned',
  'material_partially_outbound',
];
const OUTBOUND_BATCH_STATUSES: readonly ProductionBatchStatus[] = ['material_assigned'];

export const requireMaterialAllocationBatchStatus = (
  status: ProductionBatchStatus,
  supplementOnly = false,
  hasConsumedShortBatchAuthorization = false,
): void => {
  const executionStatus =
    status === 'doing' && (supplementOnly || hasConsumedShortBatchAuthorization);
  const supplementalStatus = supplementOnly && status === 'material_outbound';
  if (!ALLOCATION_BATCH_STATUSES.includes(status) && !executionStatus && !supplementalStatus)
    throw new ProductionDomainError('INVALID_STATE', '当前生产批次状态不允许分配或释放物料');
};

export const requireMaterialOutboundBatchStatus = (
  status: ProductionBatchStatus,
  context: {
    supplementOnly?: boolean;
    hasValidShortBatchAuthorization?: boolean;
    hasConsumedShortBatchAuthorization?: boolean;
    allActiveDemandsAllocated?: boolean;
  } = {},
): void => {
  const {
    supplementOnly = false,
    hasValidShortBatchAuthorization = false,
    hasConsumedShortBatchAuthorization = false,
    allActiveDemandsAllocated = false,
  } = context;
  const shortBatchStatus =
    (status === 'material_pending' || status === 'material_partially_outbound') &&
    hasValidShortBatchAuthorization;
  const fullyAllocatedContinuation =
    status === 'material_partially_outbound' && allActiveDemandsAllocated;
  const executionStatus =
    status === 'doing' && (supplementOnly || hasConsumedShortBatchAuthorization);
  if (
    status === 'material_partially_outbound' &&
    !hasValidShortBatchAuthorization &&
    !allActiveDemandsAllocated
  )
    throw new ProductionDomainError(
      'SHORT_BATCH_AUTHORIZATION_STALE',
      '物料需求计划已变化，当前短批授权已失效；请重新授权，或先完成全部活动需求分配',
    );
  if (
    !OUTBOUND_BATCH_STATUSES.includes(status) &&
    !shortBatchStatus &&
    !fullyAllocatedContinuation &&
    !executionStatus &&
    !(status === 'material_outbound' && supplementOnly)
  )
    throw new ProductionDomainError('INVALID_STATE', '只有物料已分配的生产批次可以领料出库');
};
