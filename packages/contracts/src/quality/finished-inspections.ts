import type { PageQuery, VersionedCommand } from '../common.js';
import type {
  ProductionOutputQuantities,
  ProductionOutputRoundTrigger,
  ProductionOutputRoundStatus,
} from '../production/output.js';

export type ProductionOutputInspectionMethod = 'full' | 'sampling' | 'zero_confirmation';
export type ProductionOutputReleaseDecision = 'released' | 'pending_reinspection' | 'not_released';
export interface ProductionOutputInspectionFacts {
  inspectionMethod: ProductionOutputInspectionMethod;
  /** 独立填写的合格数与不合格数之和。 */
  inspectedQuantity: number;
  /** 抽检时仅表示样本合格数。 */
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  releaseDecision: ProductionOutputReleaseDecision;
}
export interface ProductionOutputInspection extends ProductionOutputInspectionFacts {
  id: string;
  closeoutId: string;
  roundId: string;
  batchId: string;
  declaredVersion: number;
  baselinePlannedReceived: string;
  baselineExtraReceived: string;
  declared: ProductionOutputQuantities;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
  previousInspectionId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}
export interface RecordFinishedInspectionPayload extends VersionedCommand {
  inspectionMethod: ProductionOutputInspectionMethod;
  /** 独立填写的本次实检合格数；抽检时为样本合格数。 */
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  releaseDecision: ProductionOutputReleaseDecision;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
}
export type FinishedInspectionListStatus = 'pending' | 'recorded';
export interface FinishedInspectionTaskQuery extends PageQuery {
  keyword?: string;
  status?: FinishedInspectionListStatus;
}
export interface FinishedInspectionTaskItem {
  batchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  plannedQuantity: string;
  version: number;
  currentRoundId: string | null;
  currentRoundStatus: ProductionOutputRoundStatus | null;
  currentRoundNo: number | null;
  currentRoundTriggerType: ProductionOutputRoundTrigger | null;
  currentRoundReason: string | null;
  baselinePlannedReceived: string | null;
  baselineExtraReceived: string | null;
  startingDeclaredRemaining: string | null;
  currentRoundInspectionId: string | null;
  currentRevisionId: string | null;
  latestInspectionId: string | null;
  latestReleaseDecision: ProductionOutputReleaseDecision | null;
  latestInspectedAt: string | null;
  canStartInspection: boolean;
  canRecordInspection: boolean;
  canBeginReinspection: boolean;
  reinspectionBlockedReason: string | null;
  stage: FinishedInspectionStage;
  nextAction: FinishedInspectionNextAction;
}
export type FinishedInspectionStage =
  | 'awaiting_draft'
  | 'awaiting_start'
  | 'inspecting'
  | 'needs_reinspection'
  | 'not_released'
  | 'ready_for_finalization'
  | 'reviewing'
  | 'approved'
  | 'blocked';
export type FinishedInspectionNextAction =
  | 'save_draft'
  | 'start_inspection'
  | 'record_inspection'
  | 'start_reinspection'
  | 'review_output'
  | 'view_approval'
  | 'view_history';
export interface FinishedInspectionTaskDetail extends FinishedInspectionTaskItem {
  declared: ProductionOutputQuantities | null;
  latestInspection: ProductionOutputInspection | null;
  /** 确认复检前的来源当前读参考；提交时 Production 会在锁内重新计算。 */
  reinspectionRemainingQuantity: string | null;
  receivedPlannedQuantity: string;
  receivedExtraQuantity: string;
}
export interface StartFinishedInspectionResult {
  batchId: string;
  roundId: string;
  version: number;
}
export interface BeginFinishedReinspectionPayload extends VersionedCommand {
  currentRevisionId: string | null;
  reason: string;
}
export interface FinishedInspectionCommandResult {
  batchId: string;
  inspectionId: string;
  version: number;
}
