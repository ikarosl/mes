import type {
  BatchStepStatus,
  ProductionBatchStatus,
  WorkOrderStatus,
  WorkOrderType,
} from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

export function evaluateAssignmentAvailability(input: {
  batchStatus: ProductionBatchStatus;
  stepStatus: BatchStepStatus;
  hasReportHistory: boolean;
  hasStarted: boolean;
  pendingApprovalId: string | null;
}): {
  canAssign: boolean;
  assignBlockedReason: string | null;
  canReassign: boolean;
  reassignBlockedReason: string | null;
  canUnassign: boolean;
  unassignBlockedReason: string | null;
} {
  const phaseBlocked =
    input.pendingApprovalId !== null
      ? '结案或产出更正在审批，不能调整派工'
      : ['closing', 'completed', 'terminated', 'cancelled'].includes(input.batchStatus)
        ? '任务已结束执行或取消，不能调整派工'
        : null;
  const assignBlockedReason =
    phaseBlocked ?? (input.stepStatus === 'pending' ? null : '该工序已派工');
  const reassignBlockedReason =
    phaseBlocked ??
    (input.stepStatus === 'assigned' ||
    (input.batchStatus === 'doing' && ['doing', 'completed'].includes(input.stepStatus))
      ? null
      : '当前工序不允许改派');
  const unassignBlockedReason =
    phaseBlocked ??
    (input.stepStatus !== 'assigned' || input.hasStarted || input.hasReportHistory
      ? '只有未开工且无报工历史的已派工工序可以撤回派工'
      : null);
  return {
    canAssign: assignBlockedReason === null,
    assignBlockedReason,
    canReassign: reassignBlockedReason === null,
    reassignBlockedReason,
    canUnassign: unassignBlockedReason === null,
    unassignBlockedReason,
  };
}

export const requireAssignableStep = (status: BatchStepStatus): void => {
  if (status !== 'pending')
    throw new ProductionDomainError('STEP_ASSIGNMENT_CONFLICT', '只有待派工工序可以执行派工');
};

export const requireAssignedStep = (status: BatchStepStatus): void => {
  if (status !== 'assigned')
    throw new ProductionDomainError(
      'STEP_ASSIGNMENT_CONFLICT',
      '只有已派工且未开工的工序可以撤回派工',
    );
};

export const requireReassignableStep = (status: BatchStepStatus): void => {
  if (status !== 'assigned' && status !== 'doing' && status !== 'completed')
    throw new ProductionDomainError('STEP_ASSIGNMENT_CONFLICT', '当前工序状态不允许改派');
};

export const requireTaskExecutingForStepStart = (input: {
  batchStatus: ProductionBatchStatus;
}): void => {
  if (input.batchStatus !== 'doing')
    throw new ProductionDomainError('STEP_START_NOT_ALLOWED', '请由管理员先明确开始任务执行');
};

export function productionTaskStartBlockedReason(input: {
  batchStatus: ProductionBatchStatus;
  workOrderStatus: WorkOrderStatus;
  orderType: WorkOrderType;
  hasInitialMaterialConfiguration: boolean;
}): string | null {
  if (!['released', 'doing'].includes(input.workOrderStatus)) return '当前工单状态不允许开工';
  if (
    ![
      'pending',
      'material_pending',
      'material_assigned',
      'material_partially_outbound',
      'material_outbound',
    ].includes(input.batchStatus)
  )
    return '只有尚未开始执行的任务可以开工';
  if (!input.hasInitialMaterialConfiguration)
    return input.orderType === 'mass_production'
      ? '请先完整确认本任务的初始 BOM 需求配置'
      : '请先配置至少一条本任务的正式物料需求';
  return null;
}
