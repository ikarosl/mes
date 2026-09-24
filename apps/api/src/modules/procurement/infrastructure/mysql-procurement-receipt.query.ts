import { listReceiptAllocationCandidates } from './queries/receipt-acceptance.query.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool } from 'mysql2/promise';
import type {
  PageQuery,
  ProcurementReceiptQuery as ReceiptListQuery,
  ProcurementInboundReleaseQuery,
  ProcurementInboundInspectionQuery,
  ReceiptHistoryKind,
  PurchaseOrderQuery,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { MaterialVariantQuery } from '../../product/public.js';
import { QualityInboundQuery } from '../../quality/public.js';
import { ProcurementReceiptQuery } from '../application/ports/receipt-query.js';
import { QualityCommandError } from '../../quality/public.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';
import { readReceiptLines } from './queries/receipt-lines.query.js';
import {
  listReceipts,
  listInboundReleases,
  listInspections,
} from './queries/receipt-lists.query.js';
import { readReceiptHistory } from './queries/receipt-history.query.js';
import { listPurchaseOrders, getPurchaseOrder } from './queries/purchase-order.query.js';
import {
  type ReadRow,
  receiptSelect,
  RECEIPT_COLUMNS,
  mapReceipt,
  readReceiptSuppliers,
  pageInput,
} from './queries/receipt-read.shared.js';

@Injectable()
export class MysqlProcurementReceiptQuery extends ProcurementReceiptQuery {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly quality: QualityInboundQuery,
    private readonly variants: MaterialVariantQuery,
  ) {
    super();
  }
  allocationCandidates(id: string, query: PageQuery) {
    return withTransaction(this.pool, (db) => listReceiptAllocationCandidates(db, id, query));
  }
  listReceipts(query: ReceiptListQuery) {
    return withTransaction(this.pool, (db) => listReceipts(db, query));
  }
  getReceipt(id: string) {
    return withTransaction(this.pool, async (db) => {
      const [[row]] = await db.query<ReadRow[]>(
        `${receiptSelect(RECEIPT_COLUMNS + ',(SELECT COUNT(*) FROM procurement_receipt_line line WHERE line.receipt_id=r.id) line_count')} WHERE r.id=?`,
        [id],
      );
      if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货单不存在');
      return {
        ...mapReceipt(row, (await readReceiptSuppliers(db, [id])).get(id) ?? []),
        items: await readReceiptLines(db, this.quality, { receiptId: id }),
      };
    });
  }
  getReceiptLine(id: string) {
    return withTransaction(this.pool, async (db) => {
      const lines = await readReceiptLines(db, this.quality, { lineId: id });
      if (!lines[0]) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货明细不存在');
      return lines[0];
    });
  }
  listInboundReleases(query: ProcurementInboundReleaseQuery) {
    return withTransaction(this.pool, (db) => listInboundReleases(db, this.variants, query));
  }
  listInspections(query: ProcurementInboundInspectionQuery) {
    return withTransaction(this.pool, (db) => listInspections(db, this.quality, query));
  }
  getInspection(caseId: string) {
    return withTransaction(this.pool, async (db) => {
      const result = await listInspections(db, this.quality, { page: 1, pageSize: 1 }, caseId);
      if (!result.items[0]) throw new QualityCommandError('NOT_FOUND', '检验办理不存在');
      return result.items[0];
    });
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
      listPurchaseOrders(db, {
        ...query,
        ...pageInput(query),
        status: 'ordered',
        onlyNewArrival: true,
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
