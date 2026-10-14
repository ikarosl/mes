import type { RowDataPacket } from 'mysql2/promise';
import type { ProductionBatchCancellationCheck } from '@company/contracts';
import type { BatchRow, Db } from './mysql-production.shared.js';
import type { InventoryProductionDocumentCommand } from '../../inventory/public.js';

export type BatchCancellationState = {
  outbounds: {
    id: string;
    outbound_no: string;
    status: string;
    version: number;
  }[];
  allocationIds: string[];
  demandIds: string[];
  pendingCorrectionDemandIds: string[];
};

export const loadBatchCancellationState = async (
  db: Db,
  batchId: string,
  lock: boolean,
  documents: InventoryProductionDocumentCommand,
): Promise<BatchCancellationState> => {
  const suffix = lock ? ' FOR UPDATE' : '';
  const facts = await documents.facts({ productionBatchId: batchId, lock });
  const outbounds = facts.outbounds
    .filter((order) => order.status !== 'cancelled')
    .map((order) => ({
      id: order.id,
      outbound_no: order.no,
      status: order.status === 'pending' ? 'pending_picking' : order.status,
      version: order.version,
    }));
  const [allocations] = await db.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM production_item_allocation
     WHERE production_batch_id=? AND allocation_status='active'
     ORDER BY id${suffix}`,
    [batchId],
  );
  const [demands] = await db.query<
    (RowDataPacket & { id: number; pending_correction_id: number | null })[]
  >(
    `SELECT id,pending_correction_id FROM production_item_demand
     WHERE production_batch_id=? AND business_status='active'
     ORDER BY id${suffix}`,
    [batchId],
  );
  return {
    outbounds,
    allocationIds: allocations.map((row) => String(row.id)),
    demandIds: demands.map((row) => String(row.id)),
    pendingCorrectionDemandIds: demands
      .filter((row) => row.pending_correction_id != null)
      .map((row) => String(row.id)),
  };
};

export const buildBatchCancellationCheck = (
  id: string,
  batch: BatchRow,
  state: BatchCancellationState,
): ProductionBatchCancellationCheck => {
  const blockers: ProductionBatchCancellationCheck['blockers'] = [];
  if (state.pendingCorrectionDemandIds.length) blockers.push('pending_demand_correction');
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
