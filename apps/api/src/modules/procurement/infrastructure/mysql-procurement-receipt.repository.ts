import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool } from 'mysql2/promise';
import type {
  ConfirmProcurementReceiptPayload,
  RecordReceiptHandlingPayload,
  ReceiptHandlingItem,
  ConfirmProcurementInboundPayload,
  VoidProcurementReceiptPayload,
  QualityIncomingInspectionReportInput,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import { QualityInboundCommand } from '../../quality/public.js';
import { InventoryInboundCommand, InventoryInboundQuery } from '../../inventory/public.js';
import { ProcurementReceiptRepository } from '../application/ports/receipt.repository.js';
import { confirmReceiptArrival } from './mysql-receipt-arrival.operation.js';
import { confirmReceiptInbound } from './mysql-receipt-inbound.operation.js';
import { recordReceiptHandling } from './mysql-receipt-handling.operation.js';
import { voidProcurementReceipt } from './mysql-receipt-void.operation.js';
import { lockReceiptLines } from './mysql-receipt.shared.js';
import { readReceiptLine } from './queries/receipt-lines.query.js';

@Injectable()
export class MysqlProcurementReceiptRepository extends ProcurementReceiptRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly product: ProductInventoryEligibility,
    private readonly quality: QualityInboundCommand,
    private readonly inventory: InventoryInboundCommand,
    private readonly inventoryQuery: InventoryInboundQuery,
  ) {
    super();
  }
  voidReceipt(id: string, payload: VoidProcurementReceiptPayload, context: CommandContext) {
    return withTransaction(this.pool, (db) =>
      voidProcurementReceipt(db, id, payload, context, this.inventoryQuery),
    );
  }
  confirmReceipt(payload: ConfirmProcurementReceiptPayload, context: CommandContext) {
    return withTransaction(this.pool, (db) =>
      confirmReceiptArrival(db, payload, context, this.product),
    );
  }
  inspect(id: string, payload: QualityIncomingInspectionReportInput, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      await lockReceiptLines(db, [id]);
      const line = await readReceiptLine(db, id);
      return this.quality.recordIncomingInspectionReport(
        {
          source: {
            receiptId: line.receiptId,
            receiptLineId: line.id,
            receiptNo: line.receiptNo,
            purchaseNo: line.purchaseNo,
            itemCode: line.itemCode,
            itemName: line.itemName,
            materialVariantCode: line.materialVariantCode,
            unit: line.unit,
            supplierName: line.supplierName,
            specification: null,
          },
          report: payload,
        },
        context,
      );
    });
  }
  recordHandling(
    id: string,
    payload: RecordReceiptHandlingPayload,
    context: CommandContext,
  ): Promise<ReceiptHandlingItem> {
    return withTransaction(this.pool, (db) => recordReceiptHandling(db, id, payload, context));
  }
  confirmInbound(payload: ConfirmProcurementInboundPayload, context: CommandContext) {
    return withTransaction(this.pool, (db) =>
      confirmReceiptInbound(db, payload, context, this.inventory),
    );
  }
}
