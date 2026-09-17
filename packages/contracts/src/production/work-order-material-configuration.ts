import type { ProductionBatchStatus } from './statuses.js';
import type { MaterialDemandManagementVariant } from './material-demand-management.js';

export interface WorkOrderMaterialConfigurationLine {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  quantityPerUnit: string;
  materialVariantId: string | null;
  materialVariantCode: string | null;
  variants: MaterialDemandManagementVariant[];
}

export interface WorkOrderMaterialConfiguration {
  workOrderId: string;
  workOrderNo: string;
  version: number;
  canConfigure: boolean;
  blockedReason: string | null;
  /** 返回首个阻断任务供管理员定位，不下载工单全部需求历史。 */
  blockingBatch: { id: string; batchNo: string; status: ProductionBatchStatus } | null;
  lines: WorkOrderMaterialConfigurationLine[];
}

export interface SaveWorkOrderMaterialConfigurationPayload {
  version: number;
  reason: string;
  selections: Array<{ materialId: string; materialVariantId: string }>;
}

export interface SaveWorkOrderMaterialConfigurationResult {
  workOrderId: string;
  version: number;
}
