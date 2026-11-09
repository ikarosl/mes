import type { ProductionBatchStatus, WorkOrderStatus, WorkOrderType } from '@company/contracts';

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
