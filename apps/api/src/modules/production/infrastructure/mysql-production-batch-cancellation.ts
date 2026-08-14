import type { RowDataPacket } from 'mysql2/promise';
import type { ProductionBatchCancellationCheck } from '@company/contracts';
import type { BatchRow, Db } from './mysql-production.shared.js';

export type BatchCancellationState = {
  outbounds: (RowDataPacket & {
    id: number;
    outbound_no: string;
    status: string;
  })[];
  allocationIds: string[];
  demandIds: string[];
};

export const loadBatchCancellationState = async (
  db: Db,
  batchId: string,
  lock: boolean,
): Promise<BatchCancellationState> => {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [outbounds] = await db.query<BatchCancellationState['outbounds']>(
    `SELECT id,outbound_no,status FROM outbound_order
     WHERE production_batch_id=? AND status<>'cancelled'
     ORDER BY id${suffix}`,
    [batchId],
  );
  const [allocations] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM production_item_allocation
     WHERE production_batch_id=? AND allocation_status='active'
     ORDER BY id${suffix}`,
    [batchId],
  );
  const [demands] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM production_item_demand
     WHERE production_batch_id=? AND business_status='active'
     ORDER BY id${suffix}`,
    [batchId],
  );
  return {
    outbounds,
    allocationIds: allocations.map((row) => String(row.id)),
    demandIds: demands.map((row) => String(row.id)),
  };
};

export const buildBatchCancellationCheck = (
  id: string,
  batch: BatchRow,
  state: BatchCancellationState,
): ProductionBatchCancellationCheck => {
  const blockers: ProductionBatchCancellationCheck['blockers'] = [];
  if (!['pending', 'material_pending', 'material_assigned'].includes(batch.status))
    blockers.push('batch_already_started');
  if (state.outbounds.some((outbound) => outbound.status !== 'pending_picking'))
    blockers.push('material_already_outbound');
  const pendingOutbounds = state.outbounds.filter(
    (outbound) => outbound.status === 'pending_picking',
  );
  return {
    productionBatchId: id,
    batchStatus: batch.status,
    version: batch.version,
    canCancel: blockers.length === 0,
    blockers,
    activeDemandCount: state.demandIds.length,
    activeAllocationCount: state.allocationIds.length,
    pendingOutboundCount: pendingOutbounds.length,
    pendingOutbounds: pendingOutbounds.map((outbound) => ({
      id: String(outbound.id),
      outboundNo: outbound.outbound_no,
    })),
  };
};
