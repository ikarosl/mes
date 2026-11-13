import { Injectable } from '@nestjs/common';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import {
  InventoryInboundCommand,
  type TrackingOutputsInput,
  type TrackingOutputsResult,
} from '../application/inventory-inbound.command.js';
import type {
  ConfirmPurchaseReceiptInput,
  ConfirmPurchaseReceiptResult,
} from '../application/inventory-purchase-inbound.types.js';
import { MysqlInventoryPurchaseInboundWriter } from './mysql-inventory-purchase-inbound.writer.js';
import { MysqlInventoryTrackingInboundWriter } from './mysql-inventory-tracking-inbound.writer.js';

@Injectable()
export class MysqlInventoryInboundCommand extends InventoryInboundCommand {
  constructor(
    private readonly purchases: MysqlInventoryPurchaseInboundWriter,
    private readonly tracking: MysqlInventoryTrackingInboundWriter,
  ) {
    super();
  }

  confirmPurchaseReceipt(
    input: ConfirmPurchaseReceiptInput,
    context: CommandContext,
  ): Promise<ConfirmPurchaseReceiptResult> {
    return this.purchases.confirm(input, context);
  }

  postTrackingOutputs(
    input: TrackingOutputsInput,
    context: CommandContext,
  ): Promise<TrackingOutputsResult> {
    return this.tracking.post(input, context);
  }
}
