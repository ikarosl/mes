import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool } from 'mysql2/promise';
import type {
  PageQuery,
  ProcurementReceiptPurchaseOrderQuery,
  ProcurementInboundReleaseQuery,
  ReceiptHistoryKind,
  PurchaseOrderQuery,
  ProcurementReceiptDetail,
  ProcurementReceiptLine,
  ProcurementReceiptAcceptanceContext,
  ProcurementReceiptVoidingDetail,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { MaterialVariantQuery } from '../../product/public.js';
import { QualityInboundQuery } from '../../quality/public.js';
import { ProcurementReceiptQuery } from '../application/ports/receipt-query.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';
import { receiptVoidBlockedReason } from '../domain/receipt-void.policy.js';
import { readReceiptDependentPurchases } from './mysql-receipt-void.shared.js';
import {
  readReceiptSummary,
  readReceiptHeader,
  readReceiptLine,
  readReceiptLineIndex,
  readReceiptLineOverviews,
  readReceiptAcceptanceContext,
} from './queries/receipt-lines.query.js';
import {
  readInspectionCase,
  readInspectionReceiptLine,
} from './queries/receipt-inspection-detail.query.js';
import { listInboundReleases } from './queries/receipt-lists.query.js';
import {
  listReceiptPurchaseOrders,
  readReceiptPurchaseOrder,
  listPurchaseOrderReceipts,
  readReceiptWorklistLines,
  locateReceiptLine,
} from './queries/receipt-purchase-orders.query.js';
import { readReceiptHistory } from './queries/receipt-history.query.js';
import { listReceiptOrderOptions, getPurchaseOrder } from './queries/purchase-order.query.js';
import { type ReadRow, pageInput } from './queries/receipt-read.shared.js';

@Injectable()
export class MysqlProcurementReceiptQuery extends ProcurementReceiptQuery {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly quality: QualityInboundQuery,
    private readonly variants: MaterialVariantQuery,
  ) {
    super();
  }
  listReceiptPurchaseOrders(query: ProcurementReceiptPurchaseOrderQuery) {
    return withTransaction(this.pool, (db) => listReceiptPurchaseOrders(db, query));
  }
  getReceiptPurchaseOrder(id: string) {
    return withTransaction(this.pool, (db) => readReceiptPurchaseOrder(db, id));
  }
  listPurchaseOrderReceipts(id: string, query: PageQuery) {
    return withTransaction(this.pool, (db) => listPurchaseOrderReceipts(db, id, query));
  }
  receiptWorklistLines(id: string) {
    return withTransaction(this.pool, (db) => readReceiptWorklistLines(db, id));
  }
  locateReceiptLine(id: string) {
    return withTransaction(this.pool, (db) => locateReceiptLine(db, id));
  }
  getReceipt(id: string): Promise<ProcurementReceiptDetail> {
    return withTransaction(this.pool, async (db) => {
      const receipt = await readReceiptHeader(db, id);
      return { ...receipt, items: await readReceiptLineIndex(db, id, receipt.void !== null) };
    });
  }
  getReceiptVoiding(id: string): Promise<ProcurementReceiptVoidingDetail> {
    return withTransaction(this.pool, async (db) => {
      const receipt = await readReceiptSummary(db, id);
      const items = await readReceiptLineOverviews(db, id);
      const blockedReason = receiptVoidBlockedReason({
        isVoided: receipt.void !== null,
        hasExecution: items.some(
          (line) =>
            Number(line.quantities.inboundQuantity) > 0 ||
            Number(line.quantities.returnedQuantity) > 0,
        ),
        dependentPurchaseNos: await readReceiptDependentPurchases(
          db,
          items.map((line) => line.id),
        ),
      });
      return {
        ...receipt,
        items,
        voiding: {
          canVoid: blockedReason === null && items.length > 0,
          blockedReason,
          lines: items.map((line) => ({
            receiptLineId: line.id,
            version: line.version,
            roundId: line.currentRound.id,
            roundVersion: line.currentRound.version,
          })),
        },
      };
    });
  }
  getReceiptLine(id: string): Promise<ProcurementReceiptLine> {
    return withTransaction(this.pool, (db) => readReceiptLine(db, id));
  }
  getReceiptAcceptanceContext(id: string): Promise<ProcurementReceiptAcceptanceContext> {
    return withTransaction(this.pool, (db) => readReceiptAcceptanceContext(db, this.quality, id));
  }
  getInspectionReceiptLine(id: string) {
    return withTransaction(this.pool, (db) => readInspectionReceiptLine(db, this.quality, id));
  }
  listInboundReleases(query: ProcurementInboundReleaseQuery) {
    return withTransaction(this.pool, (db) => listInboundReleases(db, this.variants, query));
  }
  getInspection(caseId: string) {
    return withTransaction(this.pool, (db) => readInspectionCase(db, this.quality, caseId));
  }
  history(id: string, kind: ReceiptHistoryKind, query: PageQuery) {
    return withTransaction(this.pool, async (db) => {
      const [[line]] = await db.query<ReadRow[]>(
        'SELECT id FROM procurement_receipt_line WHERE id=?',
        [id],
      );
      if (!line) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货明细不存在');
      return readReceiptHistory(db, this.quality, id, kind, query);
    });
  }
  listReceiptOrders(query: PurchaseOrderQuery) {
    return withTransaction(this.pool, (db) =>
      listReceiptOrderOptions(db, {
        ...query,
        ...pageInput(query),
      }),
    );
  }
  getReceiptOrder(id: string) {
    return withTransaction(this.pool, async (db) => {
      const order = await getPurchaseOrder(db, id);
      if (
        order.status !== 'ordered' ||
        !order.items.some(
          (line) => line.status === 'open' && line.fulfillmentMode === 'new_arrival',
        )
      )
        throw new ProcurementDomainError('RECEIPT_STATE', '只有已下单采购可以登记到货');
      return order;
    });
  }
}
