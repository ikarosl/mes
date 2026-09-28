import type { FinishedGoodsInboundSource } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
} from './inventory-purchase-inbound.types.js';

export interface FinishedOutputInput {
  productionBatchId: string;
  workOrderId: string;
  productId: string;
  productCode: string;
  unit: string;
  remark?: string | null;
  details: Array<{
    detailKey: string;
    allocationId: string;
    revisionId: string;
    sourceType: FinishedGoodsInboundSource;
    quantity: string;
    target: import('@company/contracts').InventoryInboundTarget;
  }>;
}
export interface FinishedOutputResult {
  inboundId: string;
  inboundNo: string;
  details: Array<{
    detailKey: string;
    allocationId: string;
    batchId: string;
    inboundDetailId: string;
    transactionId: string;
  }>;
}
export abstract class InventoryInboundCommand {
  abstract confirmPurchaseReceipt(
    input: ConfirmPurchaseReceiptInput,
    context: CommandContext,
  ): Promise<ConfirmPurchaseReceiptResult>;
  /** Production holds source and allocation locks in the same transaction. */
  abstract confirmFinishedOutput(
    input: FinishedOutputInput,
    context: CommandContext,
  ): Promise<FinishedOutputResult>;
  abstract readFinishedTaskAllocationReceipts(
    batchId: string,
    lock: boolean,
  ): Promise<Record<string, string>>;
  abstract readFinishedAllocationReceipts(
    allocationIds: string[],
    lock: boolean,
  ): Promise<Record<string, string>>;
}
