import type { PageQuery } from '../common.js';
import type { ProductionTrackingOutput } from './tracking-card.js';

export type ProductionOutputStatus =
  'pending_inbound' | 'partially_inbounded' | 'inbounded' | 'cancelled' | 'no_inbound_required';
export type ProductionTaskFinishMode = 'normal' | 'early';

export interface ProductionOutputQuery extends PageQuery {
  batchId?: string;
  keyword?: string;
  status?: ProductionOutputStatus;
  /** 仅返回尚无入库记录的正数产出。 */
  pendingOnly?: boolean;
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
  receivedQuantity: string;
  pendingQuantity: string;
  receipts: ProductionOutputInboundResult[];
}

export interface RevokeProductionOutputPayload {
  reason: string;
}

export interface CreateProductionOutputInboundPayload {
  /** 同一任务的有效正数产出，每笔只能整笔入库一次。 */
  outputIds: string[];
  target: { mode: 'new_batch' } | { mode: 'existing_batch'; itemBatchId: string; version: number };
  remark?: string | null;
}
