import type { ProductionBatchStatus } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

export const MATERIAL_OPERATION_BATCH_STATUSES: readonly ProductionBatchStatus[] = [
  'material_pending',
  'material_assigned',
  'material_partially_outbound',
  'material_outbound',
  'doing',
];

export const requireMaterialAllocationBatchStatus = (status: ProductionBatchStatus): void => {
  if (!MATERIAL_OPERATION_BATCH_STATUSES.includes(status))
    throw new ProductionDomainError('INVALID_STATE', '当前生产批次状态不允许分配或释放物料');
};

export const requireMaterialOutboundBatchStatus = (status: ProductionBatchStatus): void => {
  if (!MATERIAL_OPERATION_BATCH_STATUSES.includes(status))
    throw new ProductionDomainError('INVALID_STATE', '当前生产批次状态不允许领料出库');
};
