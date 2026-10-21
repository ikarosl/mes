import type { WorkOrderDetail, WorkOrderItem } from '@company/contracts';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@company/constants';

export const canStartNextResearchRound = (
  order: Pick<WorkOrderItem, 'orderType' | 'status'>,
): boolean =>
  order.orderType === 'research' && (order.status === 'completed' || order.status === 'closed');

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const reference = (value: unknown): boolean =>
  record(value) &&
  ['id', 'workOrderNo', 'productId', 'productCode', 'productName'].every(
    (key) => typeof value[key] === 'string',
  ) &&
  WORK_ORDER_STATUSES.some((status) => status === value.status);

/** 空响应和不完整投影属于加载失败，不能补空数组后伪装成无历史。 */
export const requireWorkOrderDetail = (value: unknown, expectedId: string): WorkOrderDetail => {
  if (
    !record(value) ||
    value.id !== expectedId ||
    !reference(value) ||
    !WORK_ORDER_TYPES.some((type) => type === value.orderType) ||
    typeof value.plannedQuantity !== 'string' ||
    !Number.isInteger(value.version) ||
    !(
      value.previousResearchOrderId === null || typeof value.previousResearchOrderId === 'string'
    ) ||
    !Array.isArray(value.batches) ||
    !value.batches.every(
      (batch) => record(batch) && typeof batch.id === 'string' && typeof batch.batchNo === 'string',
    ) ||
    !Array.isArray(value.nextResearchOrders) ||
    !value.nextResearchOrders.every(reference) ||
    !(value.previousResearchOrderId === null
      ? value.previousResearchOrder === null
      : reference(value.previousResearchOrder) &&
        record(value.previousResearchOrder) &&
        value.previousResearchOrder.id === value.previousResearchOrderId)
  ) {
    throw new Error('工单详情响应不完整或与当前工单不一致，请重新加载');
  }
  return value as unknown as WorkOrderDetail;
};
