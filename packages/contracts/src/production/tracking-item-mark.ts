import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionTrackingPersonnelSnapshot } from './tracking-card.js';
import type { ProductionOutputInboundResult } from './output.js';

export type ProductionTrackingItemMarkStatus = 'active' | 'scrapped' | 'cancelled';

export interface ProductionTrackingItemMarkCodeAvailability {
  markCode: string;
  available: boolean;
}

export interface ProductionTrackingItemMarkWorkspaceChange {
  cardId: string;
  cardVersion: number;
  markId: string | null;
  previousMarkCode: string | null;
  version: number | null;
  markCode: string | null;
}
export interface SaveProductionTrackingItemMarkWorkspacePayload {
  personnelId: string;
  reason?: string;
  changes: ProductionTrackingItemMarkWorkspaceChange[];
}
export interface SaveProductionTrackingItemMarkWorkspaceResult {
  changedCount: number;
}

export interface ProductionTrackingItemMarkQuery extends PageQuery {
  batchId?: string;
  cardId?: string;
  cardNo?: string;
  keyword?: string;
  status?: ProductionTrackingItemMarkStatus;
}

export interface ProductionTrackingItemMarkWorkspaceQuery extends Omit<
  ProductionTrackingItemMarkQuery,
  'status'
> {
  status?: 'active' | 'scrapped';
}

export interface ProductionTrackingItemMarkWorkspaceRow {
  trackingCardId: string;
  cardNo: string;
  productionBatchId: string;
  cardVersion: number;
  canClear: boolean;
  item: ProductionTrackingItemMark;
}

export interface ProductionTrackingItemMark extends ProductionTrackingPersonnelSnapshot {
  id: string;
  trackingCardId: string;
  cardNo: string;
  productionBatchId: string;
  batchNo: string;
  /** 规范化十进制字符串。 */
  markCode: string;
  /** 由卡号和短码派生，不作为独立数据库身份。 */
  fullCode: string;
  status: ProductionTrackingItemMarkStatus;
  createdBy: string;
  createdAt: string;
  cancellation: { reason: string; createdBy: string; createdAt: string } | null;
  scrap: { abnormalityId: string; handlingId: string; createdAt: string } | null;
  correctionCount: number;
  version: number;
  output: ProductionTrackingItemMarkOutput | null;
  /** 所属有效终检产出的本盘入库单，不表示该件的单独入库归属。 */
  outputReceipts: ProductionOutputInboundResult[];
}

export interface ProductionTrackingItemMarkOutput extends ProductionTrackingPersonnelSnapshot {
  outputId: string;
  quantity: string;
  confirmedAt: string;
  confirmedBy: string;
}

export interface ProductionTrackingItemMarkCorrection {
  id: string;
  itemMarkId: string;
  previousMarkCode: string;
  correctedMarkCode: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface ProductionTrackingItemMarkingSummary {
  activeCount: number;
  scrappedCount: number;
  cancelledCount: number;
  totalCount: number;
}

export interface BindProductionTrackingItemMarkPayload extends VersionedCommand {
  personnelId: string;
  markCode: string;
}

export interface CancelProductionTrackingItemMarkPayload extends VersionedCommand {
  reason: string;
}

/** version is the item version. */
export interface CorrectProductionTrackingItemMarkPayload extends VersionedCommand {
  markCode: string;
  reason: string;
}
