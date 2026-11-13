import type { PageQuery, VersionedCommand } from '../common.js';
import type { WorkOrderStatus } from './statuses.js';
import type { ProductionBatchItem } from './batch.js';

export type WorkOrderCloseType = 'unproduced' | 'underproduced' | 'completed_archive';
export type WorkOrderType = 'mass_production' | 'research';

export interface WorkOrderQuery extends PageQuery {
  keyword?: string;
  productId?: string;
  status?: WorkOrderStatus;
}

export interface WorkOrderFinalOutput {
  /** 任务下最终确认产出合计，库存后续补差不回写。 */
  availableQuantity: string;
  inboundQuantity: string;
  pendingInboundQuantity: string;
  plannedShortfallQuantity: string;
  finalizedBatchCount: number;
  confirmedOutputCount: number;
}

export interface WorkOrderOption {
  id: string;
  workOrderNo: string;
  orderType: WorkOrderType;
  productId: string;
  productCode: string;
  productName: string;
  plannedQuantity: string;
  /** 有效任务计划合计，排除 cancelled。 */
  assignedQuantity: string;
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
  /** 历史引用的当前显示姓名，包含已停用或软删除用户。 */
  ownerName: string | null;
  planStartDate: string | null;
  planEndDate: string | null;
  /** 有效任务计划合计，排除 cancelled。 */
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

export interface CancelWorkOrderPayload extends VersionedCommand {
  reason: string;
}

export interface CloseWorkOrderPayload extends VersionedCommand {
  reason?: string | null;
}
