import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { placeholders } from './mysql-production-material.mapper.js';
import { activeDemandAllocationGapExistsSql } from './mysql-production-material.sql.js';

export const lockIds = async (
  connection: PoolConnection,
  table: 'item_batch' | 'production_item_demand' | 'production_item_allocation',
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return;
  await connection.query(
    `SELECT id FROM ${table} WHERE id IN (${placeholders(ids)}) ORDER BY id FOR UPDATE`,
    ids,
  );
};
export const areAllActiveDemandsAllocated = async (
  db: Pool | PoolConnection,
  batchId: string,
): Promise<boolean> => {
  const [[row]] = await db.query<(RowDataPacket & { missing: number })[]>(
    `SELECT ${activeDemandAllocationGapExistsSql('?')} missing`,
    [batchId],
  );
  return Number(row?.missing ?? 1) === 0;
};
