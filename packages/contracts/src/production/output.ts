import type { PageQuery } from '../common.js';
import type { ProductionTrackingOutput } from './tracking-card.js';

export type ProductionOutputStatus =
  'pending_inbound' | 'inbounded' | 'cancelled' | 'no_inbound_required';
export type ProductionTaskFinishMode = 'normal' | 'early';

export interface ProductionOutputQuery extends PageQuery {
  batchId?: string;
  keyword?: string;
  status?: ProductionOutputStatus;
}

export interface ProductionOutputInboundResult {
  inboundId: string;
  inboundNo: string;
  itemBatchId: string;
  batchCode: string;
  inboundQuantity: string;
}

export interface ProductionOutputItem extends ProductionTrackingOutput {
  batchNo: string;
  workOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  cardNo: string | null;
  status: ProductionOutputStatus;
  cancellation: {
    id: string;
    reason: string;
    createdBy: string;
    createdAt: string;
  } | null;
  inbound: ProductionOutputInboundResult | null;
}

export interface RevokeProductionOutputPayload {
  reason: string;
}

export interface CreateProductionOutputInboundPayload {
  /** 每笔产出完整接收，同一任务、同一成品，不接受自填数量。 */
  outputIds: string[];
  target: { mode: 'new_batch' } | { mode: 'existing_batch'; itemBatchId: string; version: number };
  remark?: string | null;
}
