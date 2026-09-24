import { confirmReceiptAcceptance } from './mysql-receipt-acceptance.operation.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool } from 'mysql2/promise';
import type {
  ConfirmProcurementReceiptPayload,
  ConfirmReceiptAcceptancePayload,
  CorrectReceiptLinePayload,
  StartReceiptReviewPayload,
  InspectReceiptLinePayload,
  RejectReceiptLinePayload,
  RevokeReceiptRejectionPayload,
  ConfirmSupplierReturnPayload,
  ConfirmProcurementInboundPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductInventoryEligibility } from '../../product/public.js';
import { QualityInboundCommand, QualityInboundQuery } from '../../quality/public.js';
import { InventoryInboundCommand, InventoryInboundQuery } from '../../inventory/public.js';
import { ProcurementReceiptRepository } from '../application/ports/receipt.repository.js';
import { confirmReceiptArrival } from './mysql-receipt-arrival.operation.js';
import { correctReceiptLine } from './mysql-receipt-correction.operation.js';
import { startReceiptReview, inspectReceiptLine } from './mysql-receipt-inspection.operations.js';
import {
  rejectReceiptLine,
  revokeReceiptRejection,
  confirmReceiptReturn,
} from './mysql-receipt-return.operations.js';
import { confirmReceiptInbound } from './mysql-receipt-inbound.operation.js';

@Injectable()
export class MysqlProcurementReceiptRepository extends ProcurementReceiptRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly product: ProductInventoryEligibility,
    private readonly quality: QualityInboundCommand,
    private readonly qualityQuery: QualityInboundQuery,
    private readonly inventory: InventoryInboundCommand,
    private readonly inventoryQuery: InventoryInboundQuery,
  ) {
    super();
  }
  confirmReceipt(payload: ConfirmProcurementReceiptPayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      confirmReceiptArrival(connection, payload, context, this.product),
    );
  }
  correctReceipt(id: string, payload: CorrectReceiptLinePayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      correctReceiptLine(connection, id, payload, context, this.quality, this.inventoryQuery),
    );
  }
  startReview(id: string, payload: StartReceiptReviewPayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      startReceiptReview(connection, id, payload, context, this.quality, this.inventoryQuery),
    );
  }
  inspect(id: string, payload: InspectReceiptLinePayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      inspectReceiptLine(
        connection,
        id,
        payload,
        context,
        this.quality,
        this.qualityQuery,
        this.inventoryQuery,
      ),
    );
  }
  accept(id: string, payload: ConfirmReceiptAcceptancePayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      confirmReceiptAcceptance(
        connection,
        id,
        payload,
        context,
        this.qualityQuery,
        this.inventoryQuery,
      ),
    );
  }
  reject(id: string, payload: RejectReceiptLinePayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      rejectReceiptLine(connection, id, payload, context, this.quality, this.inventoryQuery),
    );
  }
  revokeRejection(id: string, payload: RevokeReceiptRejectionPayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      revokeReceiptRejection(connection, id, payload, context, this.quality, this.inventoryQuery),
    );
  }
  confirmReturn(id: string, payload: ConfirmSupplierReturnPayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      confirmReceiptReturn(connection, id, payload, context, this.inventoryQuery),
    );
  }
  confirmInbound(payload: ConfirmProcurementInboundPayload, context: CommandContext) {
    return withTransaction(this.pool, (connection) =>
      confirmReceiptInbound(
        connection,
        payload,
        context,
        this.product,
        this.qualityQuery,
        this.inventory,
        this.inventoryQuery,
      ),
    );
  }
}
