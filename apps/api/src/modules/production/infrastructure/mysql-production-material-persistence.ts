import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { placeholders } from './mysql-production-material.mapper.js';
import type { InventoryProductionDocumentCommand } from '../../inventory/public.js';
import { materialQuantitiesOf } from './mysql-production-material-facts.js';
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
  documents: InventoryProductionDocumentCommand,
): Promise<boolean> => {
  const [demands] = await db.query<
    (RowDataPacket & {
      id: number;
      item_id: number;
      material_variant_id: number;
      remaining_number: string;
      pending_correction_id: number | null;
    })[]
  >(
    "SELECT id,item_id,material_variant_id,remaining_number,pending_correction_id FROM production_item_demand WHERE production_batch_id=? AND business_status='active' AND remaining_number>0 ORDER BY id FOR SHARE",
    [batchId],
  );
  const enabled = new Set(
    (
      await variants.listEnabledByMaterials([...new Set(demands.map((row) => String(row.item_id)))])
    ).map((row) => row.id),
  );
  if (demands.some((row) => !enabled.has(String(row.material_variant_id)))) return false;
  const [allocations] = await db.query<
    (RowDataPacket & { id: number; demand_id: number; assigned_number: string })[]
  >(
    `SELECT id,demand_id,assigned_number FROM production_item_allocation
     WHERE production_batch_id=? AND allocation_status NOT IN ('released','cancelled') ORDER BY id FOR SHARE NOWAIT`,
    [batchId],
  );
  const issued = materialQuantitiesOf(
    await documents.facts({ productionBatchId: batchId, lock: true }),
  ).issued;
  return demands.every(
    (demand) =>
      demand.pending_correction_id === null &&
      allocations
        .filter((allocation) => allocation.demand_id === demand.id)
        .reduce(
          (total, allocation) =>
            total +
            Math.max(
              0,
              Number(allocation.assigned_number) - (issued.get(String(allocation.id)) ?? 0),
            ),
          0,
        ) >= Number(demand.remaining_number),
  );
};
