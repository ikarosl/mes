import type { VersionedCommand } from '../common.js';
import type {
  BatchStepStatus,
  BatchStepAbnormalOrigin,
  BatchStepReportType,
  ProductionBatchStatus,
} from './statuses.js';
import type { BatchStepAbnormalDispositionItem } from './abnormal.js';
import type { ProductionStepSupplementSourceItem } from './supplement.js';

export interface ProductionStepDependencyConflictDetails extends Record<string, unknown> {
  conflictingStepRecordId: string;
  conflictingStepOrder: number;
  conflictingStepName: string;
  downstreamEffectiveReportedQuantity: string;
  correctedUpstreamNormalQuantity: string;
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
  version: number;
}

export interface ProductionWorkerTaskItem {
  stepRecordId: string;
  productionBatchId: string;
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
  needRecord: boolean;
  unit: string;
  plannedQuantity: string;
  baseNormalQuantity: string;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveDirectReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  activatedSupplementInputQuantity: string;
  activatedSupplementTargetQuantity: string;
  pendingSupplementInputQuantity: string;
  isSupplementReopened: boolean;
  supplementBlockedReason: string | null;
  startedAt: string | null;
  version: number;
  canStart: boolean;
  startBlockedReason: string | null;
  canComplete: boolean;
  completeBlockedReason: string | null;
}

export interface CreateBatchStepReportPayload extends VersionedCommand {
  normalQuantity: number;
  abnormalQuantity: number;
  abnormalOrigin?: BatchStepAbnormalOrigin | null;
  remark?: string | null;
}

export interface CorrectBatchStepReportPayload extends VersionedCommand {
  normalQuantity: number;
  abnormalQuantity: number;
  abnormalOrigin?: BatchStepAbnormalOrigin | null;
  reason: string;
}

export interface ReverseBatchStepReportPayload extends VersionedCommand {
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
}

export interface BatchStepExecutionRecordItem {
  stepRecordId: string;
  productionBatchId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  status: BatchStepStatus;
  needRecord: boolean;
  unit: string;
  baseNormalQuantity: string;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveDirectReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  remainingNormalQuantity: string;
  activatedSupplementInputQuantity: string;
  activatedSupplementTargetQuantity: string;
  pendingSupplementInputQuantity: string;
  isSupplementReopened: boolean;
  supplementBlockedReason: string | null;
  supplementSources: ProductionStepSupplementSourceItem[];
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  reports: BatchStepReportItem[];
  abnormalDispositions: BatchStepAbnormalDispositionItem[];
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
  steps: BatchStepExecutionRecordItem[];
}

export interface BatchStepReportCommandResult {
  productionBatchId: string;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  stepVersion: number;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  remainingNormalQuantity: string;
  report: BatchStepReportItem;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}

export interface CorrectBatchStepReportCommandResult {
  productionBatchId: string;
  stepRecordId: string;
  stepStatus: BatchStepStatus;
  stepVersion: number;
  requiredNormalQuantity: string;
  releasedNormalQuantity: string;
  availableNormalQuantity: string;
  effectiveReportedQuantity: string;
  effectiveNormalQuantity: string;
  effectiveAbnormalQuantity: string;
  remainingNormalQuantity: string;
  reversal: BatchStepReportItem;
  replacement: BatchStepReportItem;
  abnormalDisposition: BatchStepAbnormalDispositionItem | null;
}

export type ProductionExecutionCompletionBlocker =
  | 'batch_not_doing'
  | 'no_required_reporting_step'
  | 'required_step_incomplete'
  | 'final_step_quantity_insufficient'
  | 'active_material_demand_remains';

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
  canComplete: boolean;
  blockers: ProductionExecutionCompletionBlocker[];
}

export type CompleteProductionExecutionPayload = VersionedCommand;

export interface ProductionExecutionCompletionResult {
  productionBatchId: string;
  batchStatus: 'completed';
  completedQuantity: string;
  completedAt: string;
  completedById: string;
  version: number;
}
