import type { PageQuery, VersionedCommand } from '../common.js';
import type { WorkOrderStatus } from './statuses.js';
import type { ProductionBatchItem } from './batch.js';

export type WorkOrderCloseType =
  'unproduced' | 'underproduced' | 'completed_archive' | 'production_terminated';
export type WorkOrderType = 'mass_production' | 'research';

export interface WorkOrderQuery extends PageQuery {
  keyword?: string;
  productId?: string;
  status?: WorkOrderStatus;
}

export interface WorkOrderFinalOutput {
  /** 当前批准清单中的计划内产出；额外产出不抵扣计划缺口。 */
  availableQuantity: string;
  extraQuantity: string;
  scrapQuantity: string;
  totalQuantity: string;
  plannedShortfallQuantity: string;
  finalizedBatchCount: number;
  closingBatchCount: number;
  pendingAvailableQuantity: string;
  pendingExtraQuantity: string;
}

export interface WorkOrderOption {
  id: string;
  workOrderNo: string;
  orderType: WorkOrderType;
  productId: string;
  productCode: string;
  productName: string;
  plannedQuantity: string;
  /** 有效任务计划合计，排除 cancelled/terminated。 */
  assignedQuantity: string;
  /** 已终止任务原计划，仅供展示，不占额度。 */
  terminatedPlannedQuantity: string;
  finalOutput: WorkOrderFinalOutput;
  /** 剩余可分配数量 = 计划数量 - 有效任务已分配数量。 */
  remainingQuantity: string;
  planStartDate: string | null;
  planEndDate: string | null;
}

export interface WorkOrderItem {
  finalOutput?: WorkOrderFinalOutput;
  id: string;
  workOrderNo: string;
  orderType: WorkOrderType;
  /** 仅研发续轮在创建时关联前序，之后不可更改。 */
  previousResearchOrderId: string | null;
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
  /** 有效任务计划合计，排除 cancelled/terminated。 */
  assignedQuantity: string;
  /** 已终止任务的原计划合计，仅展示，不占分配额度。 */
  terminatedPlannedQuantity: string;
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
  previousResearchOrder: ResearchWorkOrderReference | null;
  nextResearchOrders: ResearchWorkOrderReference[];
}

export interface ResearchWorkOrderReference {
  id: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  status: WorkOrderStatus;
}

export interface CreateWorkOrderPayload {
  orderType: WorkOrderType;
  previousResearchOrderId?: string | null;
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
  orderType?: WorkOrderType;
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
