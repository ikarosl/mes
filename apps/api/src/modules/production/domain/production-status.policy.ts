import type { ProductionBatchStatus, WorkOrderStatus } from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

const workOrderTransitions: Readonly<Record<WorkOrderStatus, readonly WorkOrderStatus[]>> = {
  draft: ['released', 'cancelled'],
  released: ['doing', 'completed', 'closed'],
  doing: ['completed', 'closed'],
  completed: ['closed'],
  cancelled: [],
  closed: [],
};

const batchTransitions: Readonly<Record<ProductionBatchStatus, readonly ProductionBatchStatus[]>> =
  {
    draft: ['pending', 'cancelled'],
    pending: ['material_pending', 'cancelled', 'completed'],
    material_pending: [
      'material_assigned',
      'material_partially_outbound',
      'material_outbound',
      'doing',
      'cancelled',
      'completed',
    ],
    material_assigned: [
      'material_pending',
      'material_partially_outbound',
      'material_outbound',
      'doing',
      'cancelled',
      'completed',
    ],
    material_partially_outbound: ['material_outbound', 'doing', 'completed'],
    material_outbound: ['doing', 'completed'],
    doing: ['completed'],
    completed: ['doing', 'pending', 'material_pending'],
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
