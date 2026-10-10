import type { VersionedCommand } from '../common.js';
import type {
  BatchStepStatus,
  BatchStepAbnormalOrigin,
  BatchStepReportType,
  ProductionBatchStatus,
} from './statuses.js';
import type { BatchStepAbnormalDispositionItem } from './abnormal.js';
import type { ProductionStepSupplementSourceItem } from './supplement.js';
import type { BatchStepAbnormalDispositionView } from './report-view.js';
import type { ProductionStepQuotaDistribution } from './quota-distribution.js';

/** 事实汇总和数量差异，只作展示；正差额表示本工序大于比较基准。 */
export interface ProductionStepQuantityProjection {
  /** 计划量加全路线已履约补产授权，各道工序统一使用。 */
  upperLimitQuantity: string;
  /** 计划量加本工序之后的已履约补产授权，只作路径建议目标。 */
  requiredNormalQuantity: string;
  availableReportQuantity: string;
  effectiveReportedQuantity: string;
  effectiveDirectReportedQuantity: string;
  effectiveDirectNormalQuantity: string;
  effectiveDirectAbnormalQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  remainingNormalQuantity: string;
  previousStepNormalQuantity: string | null;
  directReportedVsPreviousNormalDifference: string | null;
  normalVsPreviousNormalDifference: string | null;
  normalVsTargetDifference: string;
}

export interface UpdateBatchStepExecutionPayload extends VersionedCommand {
  actualSopFileId?: string | null;
}

export interface AssignProductionStepPayload extends VersionedCommand {
  responsibleUserId: string;
}

export interface ProductionStepCommandResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  responsibleUserId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
}

export interface ProductionWorkerTaskItem extends ProductionStepQuantityProjection {
  stepRecordId: string;
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  stepOrder: number;
  hasPreviousStep: boolean;
  stepCode: string;
  stepName: string;
  sopFileName: string | null;
  sopVersionNo: string | null;
  status: BatchStepStatus;
  unit: string;
  plannedQuantity: string;
  baseNormalQuantity: string;
  /** 全路线已履约补产授权数量，是统一投入上限的增量。 */
  activatedSupplementInputQuantity: string;
  /** 本工序之后的已履约补产授权数量，是建议正常目标的增量。 */
  activatedSupplementTargetQuantity: string;
  /** 全路线待履约补产授权数量，尚不计入统一投入上限。 */
  pendingSupplementInputQuantity: string;
  /** 当前页本人负责工序的同快照额度分类，不扩大报工写入资格。 */
  quotaDistribution: ProductionStepQuotaDistribution;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  canStart: boolean;
  startBlockedReason: string | null;
  canReport: boolean;
  reportBlockedReason: string | null;
  canCorrectReport: boolean;
  correctionBlockedReason: string | null;
  canComplete: boolean;
  completeBlockedReason: string | null;
  canReopen: boolean;
  reopenBlockedReason: string | null;
}

export interface CreateBatchStepReportPayload extends VersionedCommand {
  normalQuantity: number;
  abnormalQuantity: number;
  abnormalOrigin?: BatchStepAbnormalOrigin | null;
  remark?: string | null;
}

export interface CorrectBatchStepReportPayload extends VersionedCommand {
  /** 替代原纯正常直接报工的全量；零数量须走全量冲销。 */
  normalQuantity: number;
  reason: string;
}

export interface ReverseBatchStepReportPayload extends VersionedCommand {
  reason: string;
}

export interface HistoricalBatchStepReportPayload extends VersionedCommand {
  normalQuantity: number;
  reason: string;
}

export interface BatchStepReportItem {
  reportId: string;
  reportNo: string;
  productionBatchId: string;
  stepRecordId: string;
  reportType: BatchStepReportType;
  reversalOfReportId: string | null;
  correctionOfReportId: string | null;
  reportedQuantity: string;
  normalQuantity: string;
  abnormalQuantity: string;
  abnormalOrigin: BatchStepAbnormalOrigin | null;
  unit: string;
  remark: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  isEffective: boolean;
  canReverse: boolean;
  canCorrect: boolean;
  correctionBlockedReason: string | null;
}

export interface BatchStepExecutionRecordItem extends ProductionStepQuantityProjection {
  stepRecordId: string;
  productionBatchId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  status: BatchStepStatus;
  unit: string;
  baseNormalQuantity: string;
  /** 全路线已履约补产授权数量，是统一投入上限的增量。 */
  activatedSupplementInputQuantity: string;
  /** 本工序之后的已履约补产授权数量，是建议正常目标的增量。 */
  activatedSupplementTargetQuantity: string;
  /** 全路线待履约补产授权数量，尚不计入统一投入上限。 */
  pendingSupplementInputQuantity: string;
  /** 全路线补产授权来源，包含已履约和待履约来源。 */
  supplementSources: ProductionStepSupplementSourceItem[];
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  reportCount: number;
  hasReportHistory: boolean;
  firstReportedAt: string | null;
  lastReportedAt: string | null;
  canReport: boolean;
  reportBlockedReason: string | null;
  canCorrectReport: boolean;
  correctionBlockedReason: string | null;
  canCreateHistoricalReport: boolean;
  historicalCorrectionBlockedReason: string | null;
  canAdminStart: boolean;
  startBlockedReason: string | null;
  canAdminComplete: boolean;
  completeBlockedReason: string | null;
  canAdminReopen: boolean;
  reopenBlockedReason: string | null;
  abnormalDispositions: BatchStepAbnormalDispositionView[];
  quotaDistribution: ProductionStepQuotaDistribution;
}

export interface ProductionExecutionRecordGroup {
  productionBatchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  batchStatus: ProductionBatchStatus;
  plannedQuantity: string;
  pendingApprovalId: string | null;
  canBatchReverse: boolean;
  batchReverseBlockedReason: string | null;
  steps: BatchStepExecutionRecordItem[];
}

export interface BatchStepReportCommandResult extends ProductionStepQuantityProjection {
  productionBatchId: string;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  stepVersion: number;
  report: BatchStepReportItem;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}

export interface CorrectBatchStepReportCommandResult extends ProductionStepQuantityProjection {
  productionBatchId: string;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  stepVersion: number;
  reversal: BatchStepReportItem;
  replacement: BatchStepReportItem;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}

export interface BatchReverseStepReportSelection {
  reportId: string;
  stepRecordId: string;
  version: number;
}

export interface PreviewBatchReverseStepReportsPayload {
  reports: BatchReverseStepReportSelection[];
}

export interface BatchReverseStepReportsPayload extends PreviewBatchReverseStepReportsPayload {
  reason: string;
  previewToken: string;
}

export type BatchStepReportDependencyKind =
  | 'abnormal_disposition'
  | 'replacement_report'
  | 'rework_source'
  | 'rework_completion'
  | 'scrap_record';

export interface BatchStepReportDependency {
  kind: BatchStepReportDependencyKind;
  id: string;
}

export type BatchStepReportReversalBlockedCode =
  | 'batch_not_allowed'
  | 'approval_pending'
  | 'not_found'
  | 'step_mismatch'
  | 'version_changed'
  | 'not_effective_normal'
  | 'business_dependency'
  | 'normal_only'
  | 'historical_normal_only'
  | 'step_not_started';

export interface BatchReverseStepReportPreviewItem extends BatchReverseStepReportSelection {
  report: BatchStepReportItem | null;
  canReverse: boolean;
  blockedCode: BatchStepReportReversalBlockedCode | null;
  blockedReason: string | null;
  dependencies: BatchStepReportDependency[];
}

export interface BatchReverseStepReportImpact {
  stepRecordId: string;
  stepOrder: number;
  stepName: string;
  stepStatus: BatchStepStatus;
  version: number;
  selectedReportIds: string[];
  before: ProductionStepQuantityProjection;
  after: ProductionStepQuantityProjection;
}

export interface BatchReverseStepReportsPreview {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  batchVersion: number;
  phase: 'execution' | 'history' | 'unavailable';
  pendingApprovalId: string | null;
  previewToken: string;
  canReverse: boolean;
  items: BatchReverseStepReportPreviewItem[];
  affectedSteps: BatchReverseStepReportImpact[];
}

export interface BatchReverseStepReportsCommandResult {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  phase: 'execution' | 'history';
  reversals: Array<{ originalReportId: string; reversal: BatchStepReportItem }>;
  steps: Array<
    ProductionStepQuantityProjection & {
      stepRecordId: string;
      stepStatus: BatchStepStatus;
      stepVersion: number;
    }
  >;
}

export type ProductionExecutionCompletionBlocker =
  | 'batch_not_doing'
  | 'no_route_step'
  | 'required_step_incomplete'
  | 'active_material_demand_remains'
  | 'unfulfilled_material_supplement';

export interface ProductionExecutionCompletionCheck {
  productionBatchId: string;
  batchStatus: ProductionBatchStatus;
  version: number;
  plannedQuantity: string;
  requiredStepCount: number;
  completedRequiredStepCount: number;
  finalRequiredStepId: string | null;
  finalRequiredStepName: string | null;
  finalEffectiveNormalQuantity: string;
  activeMaterialDemandCount: number;
  unfulfilledSupplementCount?: number;
  canComplete: boolean;
  blockers: ProductionExecutionCompletionBlocker[];
}

export type CompleteProductionExecutionPayload = VersionedCommand;

export type StartResearchExecutionPayload = VersionedCommand;

export interface ResearchExecutionStartResult {
  productionBatchId: string;
  batchStatus: 'doing';
  startedAt: string;
  version: number;
}

export interface ProductionExecutionCompletionResult {
  productionBatchId: string;
  batchStatus: 'closing' | 'completed';
  closeoutId: string;
  /** 完成校验时的末道工序有效正常报工量，不写入批次数量字段。 */
  lastStepReportedQuantity: string;
  executionCompletedAt: string;
  executionCompletedById: string;
  version: number;
}
