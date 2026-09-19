import type { ReceiptInboundFacts } from './inventory-purchase-inbound.types.js';

export abstract class InventoryInboundQuery {
  /**
   * 最多 100 个到货明细；不按当前修订过滤，不以库存余额代替累计已入量。
   * 活跃事务内对实际主单、明细和流水当前读；零入库也返回一项。
   */
  abstract getReceiptInboundFacts(input: {
    receiptLineIds: string[];
  }): Promise<ReceiptInboundFacts[]>;
}
