import type { ProductionBatchStatus } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

const ALLOCATION_BATCH_STATUSES: readonly ProductionBatchStatus[] = [
  'material_pending',
  'material_assigned',
];
const OUTBOUND_BATCH_STATUSES: readonly ProductionBatchStatus[] = [
  'material_assigned',
  'material_outbound',
];

export const requireMaterialAllocationBatchStatus = (
  status: ProductionBatchStatus,
  supplementOnly = false,
): void => {
  const supplementalStatus =
    supplementOnly && (status === 'material_outbound' || status === 'doing');
  if (!ALLOCATION_BATCH_STATUSES.includes(status) && !supplementalStatus)
    throw new ProductionDomainError('INVALID_STATE', '当前生产批次状态不允许分配或释放物料');
};

export const requireMaterialOutboundBatchStatus = (
  status: ProductionBatchStatus,
  supplementOnly = false,
): void => {
  if (!OUTBOUND_BATCH_STATUSES.includes(status) && !(status === 'doing' && supplementOnly))
    throw new ProductionDomainError('INVALID_STATE', '只有物料已分配的生产批次可以领料出库');
};
