import type { ProductionBatchStatus, WorkOrderStatus } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

const workOrderTransitions: Readonly<Record<WorkOrderStatus, readonly WorkOrderStatus[]>> = {
  draft: ['released', 'cancelled'],
  released: ['doing', 'cancelled'],
  doing: ['completed', 'cancelled'],
  completed: ['closed'],
  cancelled: [],
  closed: [],
};

const batchTransitions: Readonly<Record<ProductionBatchStatus, readonly ProductionBatchStatus[]>> =
  {
    pending: ['material_pending', 'cancelled'],
    material_pending: ['material_assigned', 'cancelled'],
    material_assigned: ['material_outbound', 'cancelled'],
    material_outbound: ['doing', 'cancelled'],
    doing: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };

export const requireWorkOrderTransition = (
  current: WorkOrderStatus,
  next: WorkOrderStatus,
): void => {
  if (!workOrderTransitions[current].includes(next)) {
    throw new ProductionDomainError('INVALID_STATE', `工单不能从 ${current} 变更为 ${next}`);
  }
};

export const requireBatchTransition = (
  current: ProductionBatchStatus,
  next: ProductionBatchStatus,
): void => {
  if (!batchTransitions[current].includes(next)) {
    throw new ProductionDomainError('INVALID_STATE', `生产批次不能从 ${current} 变更为 ${next}`);
  }
};
