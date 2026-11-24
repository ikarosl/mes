import type { PageQuery, ReasonedVersionedCommand, VersionedCommand } from '../common.js';
import type { ProductionBatchItem } from './batch.js';
import type { ProductionTaskFinishMode } from './output.js';
import type { WorkOrderStatus } from './statuses.js';
import type { ProductionTrackingItemMarkingSummary } from './tracking-item-mark.js';

export type ProductionTrackingCardStatus =
  'unused' | 'in_progress' | 'completed' | 'scrapped' | 'voided';
export type ProductionTrackingAbnormalityStatus = 'open' | 'resolved';
export type ProductionTrackingAbnormalityResolution = 'repair' | 'scrap';
export type ProductionTrackingAbnormalityScrapMode =
  'quantity_only' | 'optional_marks' | 'item_marked' | 'unknown';

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

export interface ProductionTrackingAbnormalityScrappedItemMark {
  itemMarkId: string;
  markCode: string;
}

export interface ProductionTrackingAbnormalityScrapCorrection {
  id: string;
  previousScrappedQuantity: string;
  scrappedQuantity: string;
  previousScrappedItemMarks: ProductionTrackingAbnormalityScrappedItemMark[];
  scrappedItemMarks: ProductionTrackingAbnormalityScrappedItemMark[];
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
  /** 现场结算时冻结。旧结算未记录适用的规则时为 unknown。 */
  scrapMode: ProductionTrackingAbnormalityScrapMode;
  /** 原选码与当时的文本快照。旧关联可能缺少文本，旧重放结果可能缺少整个集合。 */
  scrappedItemMarks: { itemMarkId: string; markCode: string | null }[] | null;
  currentScrappedQuantity: string;
  /** 当前有效报废绑定及其最新码文本。旧重放结果可能缺少整个集合。 */
  currentScrappedItemMarks: ProductionTrackingAbnormalityScrappedItemMark[] | null;
  corrections: ProductionTrackingAbnormalityScrapCorrection[];
  voided: { reason: string; createdBy: string; createdAt: string } | null;
  canCorrectScrap: boolean;
  scrapCorrectionBlockedReason: string | null;
  canVoid: boolean;
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
  itemMarking: ProductionTrackingItemMarkingSummary;
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
  /** 非末站无码报废限于未绑余量。末站须为每件报废选本卡有效刻码。 */
  scrappedItemMarkIds?: string[];
  /** 可选关联工序；省略或 null 表示未关联，指定值必须是本卡已到站的工序。 */
  stepRecordId?: string | null;
  personnelId: string;
  affectedQuantity: number;
  descriptionLabels: string[];
  /** 返修表示本次影响数量均已返修完成，报废扣减本次影响数量。 */
  resolution: ProductionTrackingAbnormalityResolution;
}

export interface ProductionTrackingAbnormalityDescriptionQuery extends PageQuery {
  /** 省略或 null 查询未关联工序的通用标签；指定值必须是本卡已到站的工序。 */
  stepRecordId?: string | null;
  keyword?: string;
}

export interface HandleProductionTrackingAbnormalityPayload extends VersionedCommand {
  scrappedItemMarkIds?: string[];
  personnelId: string;
  /** 与高级数量结算字段互斥。 */
  resolution?: ProductionTrackingAbnormalityResolution;
  content?: string;
  repairedQuantity?: number;
  scrappedQuantity?: number;
  scrapReferences?: { handlingId: string; quantity: number }[];
}

/** version 为原异常版本。报废数量和刻码 ID 为更正后的完整结果。 */
export interface CorrectProductionTrackingAbnormalityScrapPayload extends ReasonedVersionedCommand {
  cardVersion: number;
  scrappedQuantity: number;
  scrappedItemMarkIds: string[];
}

/** version 为原异常版本。 */
export interface VoidProductionTrackingAbnormalityPayload extends ReasonedVersionedCommand {
  cardVersion: number;
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
