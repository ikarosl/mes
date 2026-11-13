import type { CommandContext } from '../../../common/audit/audit.types.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
} from './inventory-purchase-inbound.types.js';

export interface TrackingOutputsInput {
  productionBatchId: string;
  workOrderId: string;
  productId: string;
  productCode: string;
  unit: string;
  outputs: Array<{ outputId: string; quantity: string }>;
  target: { mode: 'new_batch' } | { mode: 'existing_batch'; itemBatchId: string; version: number };
  remark?: string | null;
}

export interface TrackingOutputsResult {
  inboundId: string;
  inboundNo: string;
  itemBatchId: string;
  batchCode: string;
  inboundQuantity: string;
}

export abstract class InventoryInboundCommand {
  abstract confirmPurchaseReceipt(
    input: ConfirmPurchaseReceiptInput,
    context: CommandContext,
  ): Promise<ConfirmPurchaseReceiptResult>;
  /** Production has locked and validated every whole, uncancelled output in this transaction. */
  abstract postTrackingOutputs(
    input: TrackingOutputsInput,
    context: CommandContext,
  ): Promise<TrackingOutputsResult>;
}
