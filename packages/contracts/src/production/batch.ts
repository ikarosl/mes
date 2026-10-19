import type { WorkOrderType } from './work-order.js';
import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionCloseoutMode } from './output.js';
import type { ProductionExecutionStartMaterialSnapshot } from './execution.js';
import type { ProductionBatchStatus, BatchStepStatus } from './statuses.js';

export interface ProductionBatchQuery extends PageQuery {
  keyword?: string;
  workOrderId?: string;
  status?: ProductionBatchStatus;
  ownerId?: string;
}

export interface ProductionBatchFinalOutput {
  revisionNo: number;
  availableQuantity: string;
  extraQuantity: string;
  /** 当前批准版的历史工序报废与本次新增报废合计。 */
  scrapQuantity: string;
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
  closeoutMode: ProductionCloseoutMode | null;
  closeoutVersion: number | null;
  currentOutputRevisionId: string | null;
  /** 当前有效批准版；尚未批准时为 null，不从报工量或草稿推算。 */
  finalOutput: ProductionBatchFinalOutput | null;
  /** 工序执行确认时间，与最终结案审批时间分别展示。 */
  executionCompletedAt: string | null;
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
  needInspection: boolean;
  status: BatchStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  outputQuantity: string;
  /** 工序自检正常报工量，不代表最终质检合格数量。 */
  normalQuantity: string;
  abnormalQuantity: string;
  reworkQuantity: string;
  /** 全路线共用同一上限口径，每道工序独立核算直接报工净量。 */
  upperLimitQuantity: string;
  effectiveDirectReportedQuantity: string;
  effectiveDirectNormalQuantity: string;
  effectiveDirectAbnormalQuantity: string;
  canAssign: boolean;
  assignBlockedReason: string | null;
  canReassign: boolean;
  reassignBlockedReason: string | null;
  canUnassign: boolean;
  unassignBlockedReason: string | null;
  canEditExecution: boolean;
  executionEditBlockedReason: string | null;
  unit: string;
  remark: string | null;
  version: number;
}

export interface ProductionBatchDetail extends ProductionBatchItem {
  startedById: string | null;
  /** 首次任务开工人的当前显示姓名；未开工或引用无法解析时为 null。 */
  startedByName: string | null;
  executionCompletedBy: string | null;
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
export interface ProductionBatchStepRecordsHeader {
  id: string;
  batchNo: string;
  workOrderNo: string;
  orderType: WorkOrderType;
  productCode: string;
  productName: string;
  plannedQuantity: string;
  status: ProductionBatchStatus;
  routeCode: string | null;
  routeVersion: string | null;
}

export interface ProductionBatchStepRecords {
  batch: ProductionBatchStepRecordsHeader;
  stepRecords: BatchStepRecordItem[];
}

/** 已保存的首次开工事实；未开工时查询返回 null，不根据当前需求重算快照。 */
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
