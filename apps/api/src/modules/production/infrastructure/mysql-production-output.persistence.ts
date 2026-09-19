import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ProductionCloseoutMode, ProductionOutputDraft } from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import { findBatch } from './mysql-production.shared.js';

export type CloseoutRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  closeout_mode: ProductionCloseoutMode;
  reason: string;
  output_reason: string | null;
  available_quantity: string | null;
  extra_quantity: string | null;
  additional_scrap_quantity: string | null;
  material_review_note: string | null;
  inspection_record_id: number | null;
  current_revision_id: number | null;
  correction_reason: string | null;
  approval_instance_id: number | null;
  pending_approval_id: number | null;
  review_snapshot: object | string | null;
  version: number;
};
export const nullableOutputId = (value: number | string | null): string | null =>
  value === null ? null : String(value);
export const outputJson = (value: object | string | null): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;
export const draftOf = (row: CloseoutRow): ProductionOutputDraft | null =>
  row.available_quantity === null
    ? null
    : {
        availableQuantity: Number(row.available_quantity),
        extraQuantity: Number(row.extra_quantity),
        additionalScrapQuantity: Number(row.additional_scrap_quantity),
        reason: row.output_reason ?? '',
        materialReviewNote: row.material_review_note ?? '',
        inspectionRecordId: nullableOutputId(row.inspection_record_id),
      };
/** 与执行、入库和批准统一：工单 → 任务 → 结案根。 */
export async function lockOutputBatch(db: PoolConnection, batchId: string): Promise<CloseoutRow> {
  await lockWorkOrderForBatch(db, batchId);
  const batch = await findBatch(db, batchId, true);
  if (!['closing', 'completed', 'terminated'].includes(batch.status))
    throw new ProductionDomainError('INVALID_STATE', '任务尚未进入结案阶段');
  const [[row]] = await db.query<CloseoutRow[]>(
    'SELECT * FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE',
    [batchId],
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '结案记录不存在');
  return row;
}
export async function lockOutputId(db: PoolConnection, id: string): Promise<CloseoutRow> {
  const [[locator]] = await db.query<CloseoutRow[]>(
    'SELECT production_batch_id FROM production_batch_closeout WHERE id=?',
    [id],
  );
  if (!locator) throw new ProductionDomainError('NOT_FOUND', '结案记录不存在');
  return lockOutputBatch(db, String(locator.production_batch_id));
}
export function requireOutputVersion(row: CloseoutRow, version: number): void {
  if (row.version !== version)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '产出清单已变化，请刷新核对');
}
export function requireEditableOutput(row: CloseoutRow, version: number): void {
  requireOutputVersion(row, version);
  if (
    row.pending_approval_id !== null ||
    (row.current_revision_id !== null && row.correction_reason === null)
  )
    throw new ProductionDomainError('INVALID_STATE', '清单已送审或批准，请按清单更正流程处理');
}
