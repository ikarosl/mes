import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionBatchItem } from './batch.js';

export type ProductionTrackingCardStatus = 'unused' | 'in_progress' | 'completed' | 'voided';
export type ProductionTrackingAbnormalitySeverity = 'normal' | 'pause';
export type ProductionTrackingAbnormalityStatus = 'open' | 'resolved';

export interface ProductionTrackingPersonnelSnapshot {
  personnelId: string;
  personnelCode: string;
  personnelName: string;
}

export interface ProductionTrackingCardQuery extends PageQuery {
  batchId?: string;
  keyword?: string;
  status?: ProductionTrackingCardStatus;
  stepRecordId?: string;
  abnormalityStatus?: ProductionTrackingAbnormalityStatus;
}

export interface ProductionTrackingCardItem extends ProductionTrackingPersonnelSnapshot {
  id: string;
  cardNo: string;
  productionBatchId: string;
  batchNo: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
  status: ProductionTrackingCardStatus;
  currentStepRecordId: string | null;
  currentStepName: string | null;
  openAbnormalityCount: number;
  isPaused: boolean;
  availableQuantity: string | null;
  remark: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
  version: number;
}

export interface ProductionTrackingVisit extends ProductionTrackingPersonnelSnapshot {
  id: string;
  trackingCardId: string;
  cardNo: string;
  productionBatchId: string;
  batchNo: string;
  stepRecordId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  arrivedAt: string;
  arrivedBy: string;
  completedAt: string | null;
  completedBy: string | null;
  /** 完成该站时的盘量快照，后续改量不覆盖。 */
  reportedQuantity: string | null;
  unit: string;
}

export interface ProductionTrackingQuantityChange {
  id: string;
  previousQuantity: string;
  quantity: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface ProductionTrackingAbnormalityHandling extends ProductionTrackingPersonnelSnapshot {
  id: string;
  content: string;
  resolvesAbnormality: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ProductionTrackingAbnormality extends ProductionTrackingPersonnelSnapshot {
  id: string;
  stepRecordId: string | null;
  stepName: string | null;
  severity: ProductionTrackingAbnormalitySeverity;
  status: ProductionTrackingAbnormalityStatus;
  description: string;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
  version: number;
  handlings: ProductionTrackingAbnormalityHandling[];
}

export interface ProductionTrackingOutput extends ProductionTrackingPersonnelSnapshot {
  id: string;
  productionBatchId: string;
  trackingCardId: string | null;
  quantity: string;
  confirmedBy: string;
  confirmedAt: string;
  remark: string | null;
}

export interface ProductionTrackingCardDetail extends ProductionTrackingCardItem {
  visits: ProductionTrackingVisit[];
  quantityHistory: ProductionTrackingQuantityChange[];
  abnormalities: ProductionTrackingAbnormality[];
  output: ProductionTrackingOutput | null;
}

export interface ProductionTrackingStep {
  stepRecordId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  sopFileId: string | null;
  sopFileName: string | null;
  sopVersionNo: string | null;
  currentCardCount: number;
  completedCardCount: number;
  reportedQuantity: string;
}

export interface ProductionTrackingWorkbench {
  batch: ProductionBatchItem;
  steps: ProductionTrackingStep[];
  summary: {
    totalCardCount: number;
    unusedCardCount: number;
    inProgressCardCount: number;
    completedCardCount: number;
    voidedCardCount: number;
    openAbnormalityCount: number;
    availableQuantity: string;
  };
  researchOutput: ProductionTrackingOutput | null;
}

export interface CreateProductionTrackingCardPayload {
  quantity: number;
  personnelId: string;
  remark?: string | null;
}

export interface ScanProductionTrackingCardPayload {
  cardNo: string;
  stepRecordId: string;
  personnelId: string;
}

export interface ProductionTrackingScanResult {
  card: ProductionTrackingCardDetail;
  duplicate: boolean;
  completedVisitId: string | null;
}

export interface CorrectProductionTrackingQuantityPayload extends VersionedCommand {
  quantity: number;
  reason: string;
}

export interface VoidProductionTrackingCardPayload extends VersionedCommand {
  reason: string;
}

export interface CreateProductionTrackingAbnormalityPayload extends VersionedCommand {
  /** 涉及工序，省略时采用当前站；指定值必须是本卡已到站的工序。 */
  stepRecordId?: string | null;
  personnelId: string;
  severity: ProductionTrackingAbnormalitySeverity;
  description: string;
}

export interface HandleProductionTrackingAbnormalityPayload extends VersionedCommand {
  personnelId: string;
  content: string;
  resolve: boolean;
}

export interface ConfirmProductionTrackingOutputPayload extends VersionedCommand {
  personnelId: string;
  availableQuantity: number;
  remark?: string | null;
}

export interface FinishProductionTrackingTaskPayload extends VersionedCommand {
  reason: string;
}

export interface ProductionTrackingReportQuery extends PageQuery {
  batchId?: string;
  stepRecordId?: string;
  personnelId?: string;
}
