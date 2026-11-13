import type {
  MaterialDemandProgressStatus,
  ProductionBatchStatus,
  WorkOrderStatus,
} from '@company/contracts';
import { MATERIAL_DEMAND_PROGRESS_LABELS } from '@company/constants';

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
  { value: 'draft', label: '草稿', type: 'info' },
  { value: 'pending', label: '已下达待配料', type: 'primary' },
  { value: 'material_pending', label: '已配置物料需求', type: 'primary' },
  { value: 'material_assigned', label: '已分配物料批次', type: 'primary' },
  { value: 'material_partially_outbound', label: '部分领料', type: 'warning' },
  { value: 'material_outbound', label: '已领料出库', type: 'primary' },
  { value: 'doing', label: '执行中', type: 'primary' },
  { value: 'completed', label: '已完成', type: 'success' },
  { value: 'cancelled', label: '已取消', type: 'danger' },
];

export const orderStatusMeta = (status: WorkOrderStatus): StatusMeta<WorkOrderStatus> =>
  ORDER_STATUS_META.find((item) => item.value === status) ?? ORDER_STATUS_META[0];

export const batchStatusMeta = (status: ProductionBatchStatus): StatusMeta<ProductionBatchStatus> =>
  BATCH_STATUS_META.find((item) => item.value === status) ?? BATCH_STATUS_META[0];

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
