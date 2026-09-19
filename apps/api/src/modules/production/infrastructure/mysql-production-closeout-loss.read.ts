import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { BatchTerminationLossRecord } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import {
  readMaterialLossBatchDisplays,
  requireMaterialLossBatchDisplay,
} from './queries/material-loss-display.query.js';

export async function readCloseoutLossRecords(
  db: PoolConnection,
  batchId: string,
  lock: boolean,
): Promise<BatchTerminationLossRecord[]> {
  const [rows] = await db.query<
    (RowDataPacket & {
      id: number;
      scrap_no: string;
      loss_purpose: BatchTerminationLossRecord['purpose'];
      closeout_id: number | null;
      allocation_id: number;
      demand_id: number;
      batch_id: number;
      scrap_number: string;
      unit_snapshot: string;
      reason_type: string;
      remark: string | null;
      status: BatchTerminationLossRecord['status'];
      created_by: number;
      created_at: Date;
      confirmed_by: number | null;
      confirmed_at: Date | null;
    })[]
  >(
    `SELECT s.id,s.scrap_no,s.loss_purpose,s.closeout_id,s.allocation_id,s.demand_id,
      s.batch_id,s.scrap_number,s.unit_snapshot,
      s.reason_type,s.remark,s.status,s.created_by,s.created_at,s.confirmed_by,s.confirmed_at
    FROM item_scrap s
    WHERE s.production_batch_id=? ORDER BY s.id${lock ? ' FOR SHARE' : ''}`,
    [batchId],
  );
  // Closeout locks only its owned loss facts; immutable batch labels are presentation data.
  const displays = await readMaterialLossBatchDisplays(
    db,
    rows.map((row) => String(row.batch_id)),
  );
  return rows.map((row) => {
    const display = requireMaterialLossBatchDisplay(displays, String(row.batch_id));
    return {
      id: String(row.id),
      scrapNo: row.scrap_no,
      purpose: row.loss_purpose,
      closeoutId: row.closeout_id === null ? null : String(row.closeout_id),
      allocationId: String(row.allocation_id),
      demandId: String(row.demand_id),
      itemCode: display.itemCode,
      materialVariantCode: display.materialVariantCode,
      inventoryBatchCode: display.batchCode,
      scrapQuantity: String(row.scrap_number),
      unit: row.unit_snapshot,
      reason:
        row.loss_purpose === 'closeout_record'
          ? row.remark!
          : [row.reason_type, row.remark].filter(Boolean).join('；'),
      status: row.status,
      createdBy: String(row.created_by),
      createdAt: toBeijingISOString(row.created_at),
      confirmedBy: row.confirmed_by === null ? null : String(row.confirmed_by),
      confirmedAt: row.confirmed_at ? toBeijingISOString(row.confirmed_at) : null,
    };
  });
}
