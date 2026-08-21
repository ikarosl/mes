import type { PageQuery } from '../common.js';
import type { InboundOrderStatus } from './statuses.js';

export interface PurchaseInboundDetailItem {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemBatchId: string;
  batchCode: string;
  inboundQuantity: string;
  unit: string;
  stockStatus: 'available';
  inventoryTransactionId: string | null;
}

export interface PurchaseInboundOrderItem {
  inboundId: string;
  inboundNo: string;
  sourceType: 'purchased';
  provider: string | null;
  status: InboundOrderStatus;
  inboundAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  version: number;
  remark: string | null;
  detailCount: number;
  totalInboundQuantity: string;
  quantitySummary: Array<{ unit: string; quantity: string }>;
  details: PurchaseInboundDetailItem[];
}

export interface PurchaseInboundOrderQuery extends PageQuery {
  keyword?: string;
  status?: InboundOrderStatus;
}

export interface CreatePurchaseInboundPayload {
  inboundNo?: string | null;
  provider?: string | null;
  remark?: string | null;
  details: Array<{
    itemId: string;
    batchCode: string;
    inboundQuantity: number;
    remark?: string | null;
  }>;
}
