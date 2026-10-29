import type {
  BatchStepStatus,
  MaterialDemandProgressStatus,
  ProductionBatchStatus,
  WorkOrderStatus,
} from '@company/contracts';
import {
  BATCH_STEP_STATUS_LABELS,
  MATERIAL_DEMAND_PROGRESS_LABELS,
  PRODUCTION_TERMINATED_LABEL,
  PRODUCTION_CLOSING_LABEL,
} from '@company/constants';

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
  { value: 'material_pending', label: '已配置物料需求', type: 'primary' },
  { value: 'material_assigned', label: '已分配物料批次', type: 'primary' },
  { value: 'material_partially_outbound', label: '部分领料', type: 'warning' },
  { value: 'material_outbound', label: '已领料出库', type: 'primary' },
  { value: 'doing', label: '执行中', type: 'primary' },
  { value: 'completed', label: '已完成', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
  { value: 'terminated', label: PRODUCTION_TERMINATED_LABEL, type: 'info' },
  { value: 'closing', label: PRODUCTION_CLOSING_LABEL, type: 'warning' },
];

/** 工序执行状态元数据 */
export const STEP_STATUS_META: StatusMeta<BatchStepStatus>[] = [
  { value: 'pending', label: BATCH_STEP_STATUS_LABELS.pending, type: 'info' },
  { value: 'assigned', label: BATCH_STEP_STATUS_LABELS.assigned, type: 'primary' },
  { value: 'doing', label: BATCH_STEP_STATUS_LABELS.doing, type: 'primary' },
  { value: 'completed', label: BATCH_STEP_STATUS_LABELS.completed, type: 'success' },
  { value: 'terminated', label: BATCH_STEP_STATUS_LABELS.terminated, type: 'info' },
];

export const orderStatusMeta = (status: WorkOrderStatus): StatusMeta<WorkOrderStatus> =>
  ORDER_STATUS_META.find((item) => item.value === status) ?? ORDER_STATUS_META[0];

export const batchStatusMeta = (status: ProductionBatchStatus): StatusMeta<ProductionBatchStatus> =>
  BATCH_STATUS_META.find((item) => item.value === status) ?? BATCH_STATUS_META[0];

export const stepStatusMeta = (status: BatchStepStatus): StatusMeta<BatchStepStatus> =>
  STEP_STATUS_META.find((item) => item.value === status) ?? STEP_STATUS_META[0];

const MATERIAL_DEMAND_PROGRESS_TAG_TYPES: Record<MaterialDemandProgressStatus, StatusTagType> = {
  pending_allocation: 'warning',
  partially_allocated: 'warning',
  allocated: 'primary',
  shortage: 'danger',
  partially_outbound: 'warning',
  outbound: 'success',
  cancelled: 'info',
  closed: 'info',
  correction_pending: 'warning',
};

export const materialDemandProgressMeta = (
  status: MaterialDemandProgressStatus,
): StatusMeta<MaterialDemandProgressStatus> => ({
  value: status,
  label: MATERIAL_DEMAND_PROGRESS_LABELS[status],
  type: MATERIAL_DEMAND_PROGRESS_TAG_TYPES[status],
});

/** 整数数量格式化：千分位分隔；非法值显示 `-` */
export const formatQuantity = (value: string | number | null | undefined): string => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
    : '-';
};

/** 比例只使用服务端完整的直接报工净量与统一上限，不作为工序状态。 */
export const reportPercentage = (reported: string, upperLimit: string): number | null => {
  const numerator = Number(reported);
  const denominator = Number(upperLimit);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
};

export const formatReportPercentage = (reported: string, upperLimit: string): string => {
  const percentage = reportPercentage(reported, upperLimit);
  return percentage === null ? '—' : `${percentage.toFixed(1)}%`;
};

export const formatQuantityDifference = (value: string | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  const amount = Number(value);
  return `${amount > 0 ? '+' : ''}${formatQuantity(value)}`;
};
