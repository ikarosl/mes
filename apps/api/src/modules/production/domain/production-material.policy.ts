import type { ProductionBatchStatus } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

const ALLOCATION_BATCH_STATUSES: readonly ProductionBatchStatus[] = [
  'material_pending',
  'material_assigned',
  'material_partially_outbound',
];
const OUTBOUND_BATCH_STATUSES: readonly ProductionBatchStatus[] = [
  'material_assigned',
  'material_outbound',
];

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
  supplementOnly = false,
  hasValidShortBatchAuthorization = false,
  hasConsumedShortBatchAuthorization = false,
): void => {
  const shortBatchStatus =
    (status === 'material_pending' || status === 'material_partially_outbound') &&
    hasValidShortBatchAuthorization;
  const executionStatus =
    status === 'doing' && (supplementOnly || hasConsumedShortBatchAuthorization);
  if (
    !OUTBOUND_BATCH_STATUSES.includes(status) &&
    !shortBatchStatus &&
    !executionStatus &&
    !(status === 'material_outbound' && supplementOnly)
  )
    throw new ProductionDomainError('INVALID_STATE', '只有物料已分配的生产批次可以领料出库');
};
