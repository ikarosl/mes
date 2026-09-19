import type {
  FinishedGoodsInboundSource,
  InboundOrderStatus,
  ProductionOutputReceipts,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
} from './inventory-purchase-inbound.types.js';

export interface FinishedInboundStorage {
  inboundId: string;
  inboundNo: string;
  productionBatchId: string;
  workOrderId: string;
  productId: string;
  outputRevisionId: string;
  sourceType: FinishedGoodsInboundSource;
  status: InboundOrderStatus;
  version: number;
  detailId: string;
  quantity: string;
  batchCode: string;
  batchId: string | null;
  transactionId: string | null;
  createdBy: string;
  createdAt: Date;
  operatorId: string | null;
  inboundAt: Date | null;
  remark: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
}
export interface FinishedInboundWrite {
  productionBatchId: string;
  workOrderId: string;
  productId: string;
  outputRevisionId: string;
  sourceType: FinishedGoodsInboundSource;
  itemCode: string;
  unit: string;
  quantity: string;
  batchCode: string;
  remark: string | null;
}
export abstract class InventoryInboundCommand {
  /** 调用方同池事务已锁定全部来源根、到货及有效消费范围；批次绑定由来源模块同事务写入。 */
  abstract confirmPurchaseReceipt(
    input: ConfirmPurchaseReceiptInput,
    context: CommandContext,
  ): Promise<ConfirmPurchaseReceiptResult>;
  abstract getFinishedLocator(id: string): Promise<{ productionBatchId: string }>;
  abstract getFinishedOrder(id: string, lock?: boolean): Promise<FinishedInboundStorage>;
  abstract listFinishedSlots(
    batchId: string,
    source: FinishedGoodsInboundSource,
  ): Promise<Array<{ id: string; status: InboundOrderStatus }>>;
  abstract readFinishedReceipts(batchId: string, lock: boolean): Promise<ProductionOutputReceipts>;
  abstract createFinishedDraft(
    input: FinishedInboundWrite,
    context: CommandContext,
  ): Promise<{ inboundId: string }>;
  abstract updateFinishedDraft(
    id: string,
    version: number,
    input: FinishedInboundWrite,
    context: CommandContext,
  ): Promise<void>;
  abstract cancelFinishedDraft(
    id: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<void>;
  abstract confirmFinishedReceipt(
    id: string,
    version: number,
    input: FinishedInboundWrite,
    context: CommandContext,
  ): Promise<{ itemBatchId: string; inventoryTransactionId: string }>;
}
