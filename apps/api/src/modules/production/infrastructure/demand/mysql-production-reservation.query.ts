import { Inject, Injectable } from '@nestjs/common';
import { withActiveConnection } from '@company/database';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import {
  ProductionReservationQuery,
  ProductionReservationReadError,
  type ProductionCurrentAllocation,
} from '../../application/production-reservation.query.js';
import { bigintCompare, placeholders } from './mysql-production-material.mapper.js';

@Injectable()
export class MysqlProductionReservationQuery extends ProductionReservationQuery {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  currentAllocations(batchIds: string[]): Promise<ProductionCurrentAllocation[]> {
    const ids = [...new Set(batchIds)].sort(bigintCompare);
    if (!ids.length) return Promise.resolve([]);
    return withActiveConnection(this.pool, async (db) => {
      if (db === this.pool)
        throw new ProductionReservationReadError('当前预留读取必须处于调用者业务事务中');
      const [rows] = await db.query<
        (RowDataPacket & {
          id: string;
          batch_id: string;
          assigned_number: string;
          allocation_status: ProductionCurrentAllocation['allocationStatus'];
        })[]
      >(
        `SELECT CAST(id AS CHAR) id,CAST(batch_id AS CHAR) batch_id,assigned_number,allocation_status
         FROM production_item_allocation
         WHERE batch_id IN (${placeholders(ids)}) AND allocation_status NOT IN ('released','cancelled')
         ORDER BY id FOR SHARE NOWAIT`,
        ids,
      );
      return rows.map((row) => ({
        id: row.id,
        batchId: row.batch_id,
        assignedNumber: String(row.assigned_number),
        allocationStatus: row.allocation_status,
      }));
    });
  }
}
