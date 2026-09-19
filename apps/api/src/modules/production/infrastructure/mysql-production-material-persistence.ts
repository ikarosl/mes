import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { placeholders } from './mysql-production-material.mapper.js';
import { activeDemandAllocationGapExistsSql } from './mysql-production-material.sql.js';
import type { MaterialVariantQuery } from '../../product/public.js';

export const lockIds = async (
  connection: PoolConnection,
  table: 'production_item_demand' | 'production_item_allocation',
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
  variants: MaterialVariantQuery,
): Promise<boolean> => {
  const [demands] = await db.query<
    (RowDataPacket & { item_id: number; material_variant_id: number })[]
  >(
    "SELECT item_id,material_variant_id FROM production_item_demand WHERE production_batch_id=? AND business_status='active' AND remaining_number>0",
    [batchId],
  );
  const enabled = new Set(
    (
      await variants.listEnabledByMaterials([...new Set(demands.map((row) => String(row.item_id)))])
    ).map((row) => row.id),
  );
  if (demands.some((row) => !enabled.has(String(row.material_variant_id)))) return false;
  const [[row]] = await db.query<(RowDataPacket & { missing: number })[]>(
    `SELECT ${activeDemandAllocationGapExistsSql('?')} missing`,
    [batchId],
  );
  return Number(row?.missing ?? 1) === 0;
};
