import type { BatchStepStatus, ProductionBatchStatus, WorkOrderStatus } from '@company/contracts';
import { BATCH_STEP_STATUS_LABELS } from '@company/constants';

export type StatusTagType = 'info' | 'primary' | 'success' | 'warning' | 'danger';

export interface StatusMeta<T extends string> {
  value: T;
  label: string;
  type: StatusTagType;
}

/** 工单状态元数据 */
export const ORDER_STATUS_META: StatusMeta<WorkOrderStatus>[] = [
  { value: 'draft', label: '草稿', type: 'info' },
  { value: 'released', label: '已下达', type: 'primary' },
  { value: 'doing', label: '生产中', type: 'primary' },
  { value: 'completed', label: '已完工', type: 'success' },
  { value: 'closed', label: '已关闭', type: 'info' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
];

/** 生产批次状态元数据 */
export const BATCH_STATUS_META: StatusMeta<ProductionBatchStatus>[] = [
  { value: 'pending', label: '已生成批次', type: 'info' },
  { value: 'material_pending', label: '已生成物料需求', type: 'primary' },
  { value: 'material_assigned', label: '已分配物料批次', type: 'primary' },
  { value: 'material_outbound', label: '已领料出库', type: 'primary' },
  { value: 'doing', label: '执行中', type: 'primary' },
  { value: 'completed', label: '已完成', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
];

/** 工序执行状态元数据 */
export const STEP_STATUS_META: StatusMeta<BatchStepStatus>[] = [
  { value: 'pending', label: BATCH_STEP_STATUS_LABELS.pending, type: 'info' },
  { value: 'assigned', label: BATCH_STEP_STATUS_LABELS.assigned, type: 'primary' },
  { value: 'doing', label: BATCH_STEP_STATUS_LABELS.doing, type: 'primary' },
  { value: 'completed', label: BATCH_STEP_STATUS_LABELS.completed, type: 'success' },
];

export const STEP_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STEP_STATUS_META.map((item) => [item.value, item.label]),
);

export const orderStatusMeta = (status: WorkOrderStatus): StatusMeta<WorkOrderStatus> =>
  ORDER_STATUS_META.find((item) => item.value === status) ?? ORDER_STATUS_META[0];

export const batchStatusMeta = (status: ProductionBatchStatus): StatusMeta<ProductionBatchStatus> =>
  BATCH_STATUS_META.find((item) => item.value === status) ?? BATCH_STATUS_META[0];

export const stepStatusMeta = (status: BatchStepStatus): StatusMeta<BatchStepStatus> =>
  STEP_STATUS_META.find((item) => item.value === status) ?? STEP_STATUS_META[0];

/** 数量格式化：千分位分隔，最多保留 4 位小数；非法值显示 `-` */
export const formatQuantity = (value: string | number | null | undefined): string => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
    : '-';
};

/** 工单剩余可分配数量 */
export const getWorkOrderRemaining = (order: {
  plannedQuantity: string | number;
  assignedQuantity: string | number;
}): number => Math.max(Number(order.plannedQuantity) - Number(order.assignedQuantity), 0);

/** 根据用户选项解析负责人显示名 */
export const resolveOwnerName = (
  ownerId: string | null | undefined,
  users: Array<{ id: string; displayName: string }>,
): string => {
  if (!ownerId) return '-';
  return users.find((user) => user.id === ownerId)?.displayName ?? '-';
};
