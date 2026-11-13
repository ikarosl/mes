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
  /** 非取消任务计划合计，含正常完工和提前结束任务，与实际产出独立。 */
  assignedQuantity: string;
  finalOutput: WorkOrderFinalOutput;
  /** 工单计划减非取消任务计划合计；允许负值，仅作计划差额提示。 */
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
  /** 非取消任务计划合计，含正常完工和提前结束任务，与实际产出独立。 */
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
