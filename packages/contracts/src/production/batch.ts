import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionCloseoutMode } from './output.js';
import type {
  ProductionBatchStatus,
  BatchStepStatus,
  ShortBatchAuthorizationAction,
} from './statuses.js';

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
  productId: string;
  productCode: string;
  productName: string;
  batchNo: string;
  routeId: string | null;
  routeCode: string | null;
  routeVersion: string | null;
  plannedQuantity: string;
  /** 末道工序有效正常报工量，从正向及冲销事实派生，不是最终批准产出。 */
  lastStepReportedQuantity: string;
  planStartDate: string | null;
  planEndDate: string | null;
  startedAt: string | null;
  status: ProductionBatchStatus;
  closeoutMode: ProductionCloseoutMode | null;
  currentOutputRevisionId: string | null;
  /** 当前有效批准版；尚未批准时为 null，不从报工量或草稿推算。 */
  finalOutput: ProductionBatchFinalOutput | null;
  /** 工序执行确认时间，与最终结案审批时间分别展示。 */
  executionCompletedAt: string | null;
  executionCompletedBy: string | null;
  /** 整组物料需求计划版本，用于使短批授权在需求集变化后失效。 */
  materialPlanVersion: number;
  /** 列表页的短批授权派生状态；写接口仍由后端事务重新校验。 */
  shortBatchAuthorizationStatus: 'none' | 'valid' | 'stale' | 'consumed';
  /** 列表页短批授权按钮动作；提交时仍由授权预览事务重新计算。 */
  shortBatchAuthorizationAction: ShortBatchAuthorizationAction;
  ownerId: string | null;
  ownerName: string | null;
  completedAt: string | null;
  completedBy: string | null;
  /** 取消信息由取消及详情响应提供；新建任务时省略。 */
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  remark: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** 批次是否已有未取消的生产领料出库单；批次列表用于区分“待建单”和“已建单”。 */
  hasActiveMaterialOutbound?: boolean;
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
