import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool } from 'mysql2/promise';
import type {
  PageQuery,
  ProcurementReceiptQuery as ProcurementReceiptListQuery,
  ProcurementInboundSourceQuery,
  ReceiptHistoryKind,
  PurchaseOrderQuery,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProcurementReceiptQuery } from '../application/ports/receipt-query.js';
import { receiptVoidBlockedReason } from '../domain/receipt-void.policy.js';
import { readReceiptDependentPurchases } from './mysql-receipt-void.shared.js';
import {
  readReceiptLine,
  readReceiptLineOverviews,
  readReceiptWorklistLines,
  locateReceiptLine,
} from './queries/receipt-lines.query.js';
import { listInboundSources, listReceipts } from './queries/receipt-lists.query.js';
import { readReceiptHistory } from './queries/receipt-history.query.js';
import { listReceiptOrderOptions, getPurchaseOrder } from './queries/purchase-order.query.js';
import { readReceiptSummary, pageInput } from './queries/receipt-read.shared.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';
@Injectable()
export class MysqlProcurementReceiptQuery extends ProcurementReceiptQuery {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }
  listReceipts(query: ProcurementReceiptListQuery) {
    return withTransaction(this.pool, (db) => listReceipts(db, query));
  }
  receiptWorklistLines(id: string) {
    return withTransaction(this.pool, (db) => readReceiptWorklistLines(db, id));
  }
  locateReceiptLine(id: string) {
    return withTransaction(this.pool, (db) => locateReceiptLine(db, id));
  }
  getReceipt(id: string) {
    return withTransaction(this.pool, async (db) => ({
      ...(await readReceiptSummary(db, id)),
      items: await readReceiptLineOverviews(db, id),
    }));
  }
  getReceiptLine(id: string) {
    return withTransaction(this.pool, (db) => readReceiptLine(db, id));
  }
  getReceiptVoiding(id: string) {
    return withTransaction(this.pool, async (db) => {
      const receipt = await readReceiptSummary(db, id),
        items = await readReceiptLineOverviews(db, id);
      const blockedReason = receiptVoidBlockedReason({
        isVoided: receipt.void !== null,
        hasExecution: items.some((line) => BigInt(line.quantities.inboundQuantity) > 0n),
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
          lines: items.map((line) => ({ receiptLineId: line.id, version: line.version })),
        },
      };
    });
  }
  listInboundSources(query: ProcurementInboundSourceQuery) {
    return withTransaction(this.pool, (db) => listInboundSources(db, query));
  }
  history(id: string, kind: ReceiptHistoryKind, query: PageQuery) {
    return withTransaction(this.pool, async (db) => {
      await readReceiptLine(db, id);
      return readReceiptHistory(db, id, kind, query);
    });
  }
  listReceiptOrders(query: PurchaseOrderQuery) {
    return withTransaction(this.pool, (db) =>
      listReceiptOrderOptions(db, { ...query, ...pageInput(query) }),
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
        throw new ProcurementDomainError(
          'RECEIPT_STATE',
          '只有已下单且有进行中新到货行的采购可以登记到货',
        );
      return order;
    });
  }
}
