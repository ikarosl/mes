import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionBatchStatus, BatchStepStatus } from './statuses.js';

export interface ProductionBatchQuery extends PageQuery {
  keyword?: string;
  workOrderId?: string;
  status?: ProductionBatchStatus;
  ownerId?: string;
}

export interface ProductionBatchItem {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  batchNo: string;
  routeId: string | null;
  routeCode: string | null;
  routeVersion: string | null;
  plannedQuantity: string;
  completedQuantity: string;
  qualifiedQuantity: string;
  planStartDate: string | null;
  planEndDate: string | null;
  startedAt: string | null;
  status: ProductionBatchStatus;
  ownerId: string | null;
  ownerName: string | null;
  completedAt: string | null;
  completedBy: string | null;
  remark: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** 批次是否已有未取消的生产领料出库单；批次列表用于区分“待建单”和“已建单”。 */
  hasActiveMaterialOutbound?: boolean;
}

export type ProductionBatchCancellationBlocker =
  'batch_already_started' | 'material_already_outbound';

export interface ProductionBatchCancellationCheck {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  version: number;
  canCancel: boolean;
  blockers: ProductionBatchCancellationBlocker[];
  activeDemandCount: number;
  activeAllocationCount: number;
  pendingOutboundCount: number;
  pendingOutbounds: Array<{ id: string; outboundNo: string }>;
}

export interface ProductionExecutionBatchSummary extends ProductionBatchItem {
  completedStepCount: number;
  totalStepCount: number;
  effectiveAbnormalQuantity: string;
  pendingAbnormalCount: number;
}

export interface BatchStepRecordItem {
  id: string;
  productionBatchId: string;
  routeStepId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  defaultSopFileId: string | null;
  defaultSopFileName: string | null;
  defaultSopVersionNo: string | null;
  actualSopFileId: string | null;
  actualSopFileName: string | null;
  actualSopVersionNo: string | null;
  defaultResponsibleUserId: string | null;
  defaultResponsibleUserName: string | null;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  needRecord: boolean;
  needInspection: boolean;
  status: BatchStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  outputQuantity: string;
  qualifiedQuantity: string;
  abnormalQuantity: string;
  reworkQuantity: string;
  unit: string;
  remark: string | null;
  version: number;
}

export interface ProductionBatchDetail extends ProductionBatchItem {
  stepRecords: BatchStepRecordItem[];
}

export interface CreateProductionBatchPayload {
  batchNo?: string | null;
  routeId?: string | null;
  plannedQuantity: number;
  ownerId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  remark?: string | null;
  stepOverrides?: CreateBatchStepOverridePayload[];
}

export interface CreateBatchStepOverridePayload {
  routeStepId: string;
  actualSopFileId?: string | null;
}

export interface UpdateProductionBatchPayload extends VersionedCommand {
  ownerId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  remark?: string | null;
}

export interface CancelProductionBatchPayload extends VersionedCommand {
  reason: string;
}
