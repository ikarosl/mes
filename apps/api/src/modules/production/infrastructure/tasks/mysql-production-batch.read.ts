import type { ProductionBatchDetail, ProductionBatchStartRecord } from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import {
  BATCH_OVERVIEW_SELECT,
  mapBatch,
  type BatchOverviewRow,
} from './mysql-production-batch.persistence.js';
import { readStartMaterialSnapshot } from './mysql-production-start-material-snapshot.js';
import { type Db } from '../shared/mysql-production-db.js';

type BatchStartRecordRow = RowDataPacket & {
  id: number;
  started_at: Date | null;
  started_by: number | null;
  start_reason: string | null;
  start_material_snapshot: unknown;
};

export async function selectBatchOverview(db: Db, id: string): Promise<ProductionBatchDetail> {
  const [[row]] = await db.query<BatchOverviewRow[]>(`${BATCH_OVERVIEW_SELECT} WHERE b.id=?`, [id]);
  if (!row) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  return mapBatchOverview(row);
}

export function mapBatchOverview(row: BatchOverviewRow): ProductionBatchDetail {
  return {
    ...mapBatch(row),
    startedById: row.started_by === null ? null : String(row.started_by),
    startedByName: null,
    finishReason: row.finish_reason,
    finishMode: row.finish_mode,
    completedBy: row.completed_by === null ? null : String(row.completed_by),
    cancelReason: row.cancel_reason,
    cancelledBy: row.cancelled_by === null ? null : String(row.cancelled_by),
    cancelledByName: null,
    cancelledAt: row.cancelled_at === null ? null : toBeijingISOString(row.cancelled_at),
    remark: row.remark,
    createdAt: toBeijingISOString(row.created_at),
    updatedAt: toBeijingISOString(row.updated_at),
  };
}

export async function selectBatchStartRecord(
  db: Db,
  id: string,
): Promise<ProductionBatchStartRecord | null> {
  const [[row]] = await db.query<BatchStartRecordRow[]>(
    `SELECT id,started_at,started_by,start_reason,start_material_snapshot
     FROM production_batches WHERE id=?`,
    [id],
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
  if (row.started_at === null) return null;
  const snapshot = readStartMaterialSnapshot(row.start_material_snapshot);
  if (row.started_by === null || snapshot === null) throw new Error('任务开工记录存储不完整');
  return {
    productionBatchId: String(row.id),
    startedAt: toBeijingISOString(row.started_at),
    startedById: String(row.started_by),
    startedByName: null,
    startReason: row.start_reason,
    startMaterialSnapshot: snapshot,
  };
}
