import type { RowDataPacket } from 'mysql2/promise';
import type { Db } from '../shared/mysql-production-db.js';
import type { BatchRow } from './mysql-production-batch.persistence.js';

const DRAFT_USAGE_QUERIES = [
  'SELECT production_batch_id FROM production_material_requirement_basis WHERE production_batch_id=? LIMIT 1',
  'SELECT production_batch_id FROM production_item_demand WHERE production_batch_id=? LIMIT 1',
  'SELECT production_batch_id FROM production_manual_demand_addition WHERE production_batch_id=? LIMIT 1',
  'SELECT production_batch_id FROM production_tracking_card WHERE production_batch_id=? LIMIT 1',
  'SELECT production_batch_id FROM production_tracking_card_sequence WHERE production_batch_id=? LIMIT 1',
  'SELECT production_batch_id FROM production_tracking_output WHERE production_batch_id=? LIMIT 1',
  'SELECT production_batch_id FROM batch_step_records WHERE production_batch_id=? LIMIT 1',
];

export async function isUnusedBatchDraft(
  db: Db,
  batch: Pick<BatchRow, 'id' | 'status' | 'started_at' | 'work_order_status'>,
  lock = false,
): Promise<boolean> {
  if (
    batch.status !== 'draft' ||
    batch.started_at !== null ||
    (batch.work_order_status !== 'released' && batch.work_order_status !== 'doing')
  )
    return false;
  // 草稿下达前不能已有物料、执行或工序事实；写侧在根锁后使用当前读。
  for (const query of DRAFT_USAGE_QUERIES) {
    const [rows] = await db.query<RowDataPacket[]>(`${query}${lock ? ' FOR UPDATE' : ''}`, [
      batch.id,
    ]);
    if (rows.length > 0) return false;
  }
  return true;
}
