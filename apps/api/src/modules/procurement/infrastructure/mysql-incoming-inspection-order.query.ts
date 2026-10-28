import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type {
  PageQuery,
  QualityIncomingInspectionOrderQuery,
  QualityIncomingInspectionReceiptCandidateQuery,
} from '@company/contracts';
import type { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { IncomingInspectionOrderQuery } from '../application/ports/incoming-inspection-order.query.js';
import {
  listIncomingInspectionOrderReceipts,
  listIncomingInspectionOrders,
  listIncomingInspectionReceiptCandidates,
  locateIncomingInspectionLine,
  readIncomingInspectionOrder,
  readIncomingInspectionReceiptLines,
} from './queries/incoming-inspection-orders.query.js';

@Injectable()
export class MysqlIncomingInspectionOrderQuery extends IncomingInspectionOrderQuery {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }
  list(query: QualityIncomingInspectionOrderQuery) {
    return withTransaction(this.pool, (db) => listIncomingInspectionOrders(db, query));
  }
  targets(query: PageQuery & { keyword?: string }) {
    return withTransaction(this.pool, (db) => listIncomingInspectionOrders(db, query));
  }
  get(id: string) {
    return withTransaction(this.pool, (db) => readIncomingInspectionOrder(db, id));
  }
  receipts(id: string, query: PageQuery) {
    return withTransaction(this.pool, (db) => listIncomingInspectionOrderReceipts(db, id, query));
  }
  candidates(query: QualityIncomingInspectionReceiptCandidateQuery) {
    return withTransaction(this.pool, (db) => listIncomingInspectionReceiptCandidates(db, query));
  }
  receiptLines(receiptId: string) {
    return withTransaction(this.pool, (db) => readIncomingInspectionReceiptLines(db, receiptId));
  }
  locate(receiptLineId: string) {
    return withTransaction(this.pool, (db) => locateIncomingInspectionLine(db, receiptLineId));
  }
}
