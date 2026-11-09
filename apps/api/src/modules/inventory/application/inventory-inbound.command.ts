import type { CommandContext } from '../../../common/audit/audit.types.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
} from './inventory-purchase-inbound.types.js';

export interface TrackingOutputInput {
  productionBatchId: string;
  workOrderId: string;
  productId: string;
  productCode: string;
  unit: string;
  outputId: string;
  quantity: string;
  remark?: string | null;
}

export interface TrackingOutputResult {
  inboundId: string;
  inboundNo: string;
  inboundDetailId: string;
  batchId: string;
  batchNo: string;
  transactionId: string;
  quantity: string;
}

export abstract class InventoryInboundCommand {
  abstract confirmPurchaseReceipt(
    input: ConfirmPurchaseReceiptInput,
    context: CommandContext,
  ): Promise<ConfirmPurchaseReceiptResult>;
  /** Production has locked and created the final output in the same transaction. */
  abstract confirmTrackingOutput(
    input: TrackingOutputInput,
    context: CommandContext,
  ): Promise<TrackingOutputResult>;
}
