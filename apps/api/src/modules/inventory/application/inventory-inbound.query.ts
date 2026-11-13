import type { InventoryInboundBatchCandidate, PageResult } from '@company/contracts';
import type { ReceiptInboundFacts } from './inventory-purchase-inbound.types.js';

export interface TrackingOutputReceipt {
  outputId: string;
  inboundId: string;
  inboundNo: string;
  itemBatchId: string;
  batchCode: string;
  inboundQuantity: string;
}

export abstract class InventoryInboundQuery {
  /**
   * 最多 100 个到货明细；不按当前修订过滤，不以库存余额代替累计已入量。
   * 活跃事务内对实际主单、明细和流水当前读；零入库也返回一项。
   */
  abstract listInboundBatchCandidates(input: {
    itemKind: 'material' | 'finished_product';
    materialVariantId?: string;
    productId?: string;
    unit: string;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PageResult<InventoryInboundBatchCandidate>>;
  /** Only batches with completed finished receipts belonging to this same task are eligible. */
  abstract listTrackingInboundBatchCandidates(input: {
    productionBatchId: string;
    productId: string;
    unit: string;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PageResult<InventoryInboundBatchCandidate>>;
  /** At most 100 outputs. Active transactions read current completed original receipts. */
  abstract getTrackingOutputReceipts(input: {
    outputIds: string[];
  }): Promise<TrackingOutputReceipt[]>;
  abstract getReceiptInboundFacts(input: {
    receiptLineIds: string[];
  }): Promise<ReceiptInboundFacts[]>;
}
