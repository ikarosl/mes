import type { WorkOrderType } from './work-order.js';
import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionExecutionStartMaterialSnapshot } from './execution.js';
import type { ProductionBatchStatus } from './statuses.js';
import type { ProductionTaskFinishMode } from './output.js';

export interface ProductionBatchQuery extends PageQuery {
  keyword?: string;
  workOrderId?: string;
  status?: ProductionBatchStatus;
  ownerId?: string;
}

export interface ProductionBatchFinalOutput {
  availableQuantity: string;
  confirmedOutputCount: number;
  inboundQuantity: string;
  pendingInboundQuantity: string;
}

export interface ProductionBatchItem {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  orderType: WorkOrderType;
  productId: string;
  productCode: string;
  productName: string;
  batchNo: string;
  routeId: string | null;
  routeCode: string | null;
  routeVersion: string | null;
  plannedQuantity: string;
  planStartDate: string | null;
  planEndDate: string | null;
  startedAt: string | null;
  status: ProductionBatchStatus;
  /** 每盘终检或研发任务最终确认事实的汇总。 */
  finalOutput: ProductionBatchFinalOutput;
  ownerId: string | null;
  ownerName: string | null;
  completedAt: string | null;
  version: number;
}

export type ProductionBatchCancellationBlocker =
  'batch_already_started' | 'material_already_outbound' | 'pending_demand_correction';

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

export interface ProductionBatchDetail extends ProductionBatchItem {
  /** GET 任务详情提供当前计划数量编辑能力；命令成功响应不携带。 */
  canEditPlan?: boolean;
  /** GET 任务详情提供草稿路线编辑能力；下达后保持冻结路线。 */
  canEditRoute?: boolean;
  startedById: string | null;
  /** 首次任务开工人的当前显示姓名；未开工或引用无法解析时为 null。 */
  startedByName: string | null;
  finishReason: string | null;
  finishMode: ProductionTaskFinishMode | null;
  completedBy: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 工序工作台的任务上下文，不承载任务详情、开工物料快照或结案产出。 */
export interface ProductionBatchStartRecord {
  productionBatchId: string;
  startedAt: string;
  startedById: string;
  startedByName: string | null;
  startReason: string | null;
  startMaterialSnapshot: ProductionExecutionStartMaterialSnapshot;
}

export interface CreateProductionBatchPayload {
  /** 批量任务必须显式选择；研发任务不得传入路线。 */
  routeId?: string | null;
  plannedQuantity: number;
  /** 必须指定当前任务负责人场景中的合格人员。 */
  ownerId: string;
  planStartDate?: string | null;
  planEndDate?: string | null;
  remark?: string | null;
  /** 仅供旧创建请求成功重放；新任务的覆盖参数在下达时提交。 */
  stepOverrides?: CreateBatchStepOverridePayload[];
}

export interface CreateBatchStepOverridePayload {
  routeStepId: string;
  actualSopFileId?: string | null;
}

export interface UpdateProductionBatchPayload extends VersionedCommand {
  plannedQuantity?: number;
  /** 仅草稿批量任务可换线；研发任务不得配置路线。 */
  routeId?: string | null;
  /** 省略时保留并复核当前负责人；不能清空。 */
  ownerId?: string;
  planStartDate?: string | null;
  planEndDate?: string | null;
  remark?: string | null;
}

export interface ReleaseProductionBatchPayload extends VersionedCommand {
  stepOverrides?: CreateBatchStepOverridePayload[];
}

export interface CancelProductionBatchPayload extends VersionedCommand {
  reason: string;
}
