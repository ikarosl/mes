import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionBatchItem } from './batch.js';
import type { ProductionTaskFinishMode } from './output.js';
import type { WorkOrderStatus } from './statuses.js';

export type ProductionTrackingCardStatus =
  'unused' | 'in_progress' | 'completed' | 'scrapped' | 'voided';
export type ProductionTrackingAbnormalityStatus = 'open' | 'resolved';
export type ProductionTrackingAbnormalityResolution = 'repair' | 'scrap';

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
  /** 本卡所有异常的独立描述标签，包含已处理异常，按首次出现去重。 */
  abnormalityLabels: string[];
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
  repairedQuantity: string;
  scrappedQuantity: string;
  scrapReferences: { handlingId: string; quantity: string }[];
  createdBy: string;
  createdAt: string;
}

export interface ProductionTrackingAbnormality extends ProductionTrackingPersonnelSnapshot {
  id: string;
  stepRecordId: string | null;
  stepName: string | null;
  affectedQuantity: string;
  status: ProductionTrackingAbnormalityStatus;
  description: string;
  /** 每枚标签独立保存；历史完整说明作为单枚标签保留。 */
  descriptionLabels: string[];
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
  version: number;
  handling: ProductionTrackingAbnormalityHandling | null;
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
  workOrderStatus: WorkOrderStatus;
  steps: ProductionTrackingStep[];
  summary: {
    totalCardCount: number;
    unusedCardCount: number;
    inProgressCardCount: number;
    completedCardCount: number;
    scrappedCardCount: number;
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

export interface CreateProductionTrackingCardsPayload {
  totalQuantity: number;
  quantityPerCard: number;
  personnelId: string;
  remark?: string | null;
}

export interface ProductionTrackingCardsCreatedResult {
  cards: ProductionTrackingCardDetail[];
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
  /** 可选关联工序；省略或 null 表示未关联，指定值必须是本卡已到站的工序。 */
  stepRecordId?: string | null;
  personnelId: string;
  affectedQuantity: number;
  descriptionLabels: string[];
  /** 与 mixedScrappedQuantity 互斥；返修表示全部返修完成，报废扣减本次影响数量。 */
  resolution?: ProductionTrackingAbnormalityResolution;
  /** 同次混合处置的新增报废数量；返修数量由影响数量减去此值派生，两者均须为正。 */
  mixedScrappedQuantity?: number;
}

export interface ProductionTrackingAbnormalityDescriptionQuery extends PageQuery {
  /** 省略或 null 查询未关联工序的通用标签；指定值必须是本卡已到站的工序。 */
  stepRecordId?: string | null;
  keyword?: string;
}

export interface HandleProductionTrackingAbnormalityPayload extends VersionedCommand {
  personnelId: string;
  /** 与高级数量结算字段互斥。 */
  resolution?: ProductionTrackingAbnormalityResolution;
  content?: string;
  repairedQuantity?: number;
  scrappedQuantity?: number;
  scrapReferences?: { handlingId: string; quantity: number }[];
}

export interface ConfirmProductionTrackingOutputPayload extends VersionedCommand {
  personnelId: string;
  remark?: string | null;
}

export interface ConfirmProductionResearchOutputPayload extends ConfirmProductionTrackingOutputPayload {
  availableQuantity: number;
}

export interface FinishProductionTrackingTaskPayload extends VersionedCommand {
  mode: ProductionTaskFinishMode;
  reason: string;
}

export interface ReopenProductionTrackingTaskPayload extends VersionedCommand {
  reason: string;
}

export interface ProductionTrackingReportQuery extends PageQuery {
  batchId?: string;
  stepRecordId?: string;
  personnelId?: string;
}
