import type { PageQuery, VersionedCommand } from '../common.js';
import type { WorkOrderStatus } from './statuses.js';
import type { ProductionBatchItem } from './batch.js';

export type WorkOrderCloseType = 'unproduced' | 'underproduced' | 'completed_archive';

export interface WorkOrderQuery extends PageQuery {
  keyword?: string;
  productId?: string;
  status?: WorkOrderStatus;
}

export interface WorkOrderOption {
  id: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  /** 剩余可分配数量 = 计划数量 - 已分配数量 */
  remainingQuantity: string;
  planStartDate: string | null;
  planEndDate: string | null;
}

export interface WorkOrderItem {
  id: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  plannedQuantity: string;
  customerName: string | null;
  qualityLevel: string | null;
  workOrderOwnerId: string | null;
  planStartDate: string | null;
  planEndDate: string | null;
  assignedQuantity: string;
  status: WorkOrderStatus;
  releasedAt: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  closeType: WorkOrderCloseType | null;
  closeReason: string | null;
  closedBy: string | null;
  closedByName: string | null;
  closedAt: string | null;
  externalOrderNo: string | null;
  remark: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderDetail extends WorkOrderItem {
  batches: ProductionBatchItem[];
}

export interface CreateWorkOrderPayload {
  workOrderNo: string;
  productId: string;
  plannedQuantity: number;
  customerName?: string | null;
  qualityLevel?: string | null;
  workOrderOwnerId?: string | null;
  planStartDate: string;
  planEndDate: string;
  externalOrderNo?: string | null;
  remark?: string | null;
}

export interface UpdateWorkOrderPayload extends VersionedCommand {
  productId?: string;
  plannedQuantity?: number;
  customerName?: string | null;
  qualityLevel?: string | null;
  workOrderOwnerId?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  externalOrderNo?: string | null;
  remark?: string | null;
}

export type CompleteWorkOrderPayload = VersionedCommand;

export interface CancelWorkOrderPayload extends VersionedCommand {
  reason: string;
}

export interface CloseWorkOrderPayload extends VersionedCommand {
  reason?: string | null;
}
