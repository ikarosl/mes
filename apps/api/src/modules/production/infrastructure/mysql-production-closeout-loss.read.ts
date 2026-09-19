import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { BatchTerminationLossRecord } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';

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
      item_code_snapshot: string;
      material_variant_code_snapshot: string;
      batch_code: string;
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
      b.item_code_snapshot,b.material_variant_code_snapshot,b.batch_code,s.scrap_number,s.unit_snapshot,
      s.reason_type,s.remark,s.status,s.created_by,s.created_at,s.confirmed_by,s.confirmed_at
    FROM item_scrap s JOIN item_batch b ON b.id=s.batch_id
    WHERE s.production_batch_id=? ORDER BY s.id${lock ? ' FOR SHARE' : ''}`,
    [batchId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    scrapNo: row.scrap_no,
    purpose: row.loss_purpose,
    closeoutId: row.closeout_id === null ? null : String(row.closeout_id),
    allocationId: String(row.allocation_id),
    demandId: String(row.demand_id),
    itemCode: row.item_code_snapshot,
    materialVariantCode: row.material_variant_code_snapshot,
    inventoryBatchCode: row.batch_code,
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
  }));
}
