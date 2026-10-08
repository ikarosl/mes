import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ProductionOutputRoundStatus, ProductionOutputRoundTrigger } from '@company/contracts';
import type { InventoryInboundCommand } from '../../inventory/public.js';
import type { QualityFinishedInspectionQuery } from '../../quality/public.js';
import {
  evaluateOutputReinspection,
  type OutputReinspectionPreview,
} from '../domain/production-output-reinspection.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { readProductionOutputReceipts } from './mysql-production-output-receipts.js';

type PreviewRow = RowDataPacket & {
  id: number;
  available_quantity: string | null;
  extra_quantity: string | null;
  correction_reason: string | null;
  pending_approval_id: number | null;
  current_revision_id: number | null;
  round_status: ProductionOutputRoundStatus | null;
  round_trigger_type: ProductionOutputRoundTrigger | null;
};

/** 由 Repository 在同一读取事务内调用，只加载复检预览需要的事实。 */
export async function readOutputReinspectionPreview(
  db: PoolConnection,
  batchId: string,
  inventory: InventoryInboundCommand,
  quality: QualityFinishedInspectionQuery,
): Promise<OutputReinspectionPreview | null> {
  const [[row]] = await db.query<PreviewRow[]>(
    `SELECT c.id,c.available_quantity,c.extra_quantity,c.correction_reason,
      c.pending_approval_id,c.current_revision_id,
      round.status round_status,round.trigger_type round_trigger_type
      FROM production_batch_closeout c LEFT JOIN production_output_round round
        ON round.id=c.current_round_id AND round.closeout_id=c.id
      WHERE c.production_batch_id=?`,
    [batchId],
  );
  if (!row) return null;
  let approved: { availableQuantity: number; extraQuantity: number } | null = null;
  if (row.current_revision_id !== null) {
    const [[revision]] = await db.query<
      (RowDataPacket & {
        baseline_planned_received: string;
        baseline_extra_received: string;
        planned_allocation: string;
        extra_allocation: string;
      })[]
    >(
      `SELECT round.baseline_planned_received,round.baseline_extra_received,
        COALESCE((SELECT a.quantity FROM production_output_allocation a
          WHERE a.revision_id=r.id AND a.category='self_made'),0) planned_allocation,
        COALESCE((SELECT a.quantity FROM production_output_allocation a
          WHERE a.revision_id=r.id AND a.category='production_extra'),0) extra_allocation
        FROM production_output_revision r JOIN production_output_round round ON round.id=r.round_id
        WHERE r.id=? AND r.closeout_id=?`,
      [row.current_revision_id, row.id],
    );
    if (!revision) throw new ProductionDomainError('INVALID_STATE', '当前批准清单引用无效');
    approved = {
      availableQuantity:
        Number(revision.baseline_planned_received) + Number(revision.planned_allocation),
      extraQuantity: Number(revision.baseline_extra_received) + Number(revision.extra_allocation),
    };
  }
  const hasInspection = await quality.hasForCloseout(String(row.id), batchId);
  const receipts = await readProductionOutputReceipts(db, inventory, batchId, false);
  return evaluateOutputReinspection({
    hasPendingApproval: row.pending_approval_id !== null,
    hasCorrection: row.correction_reason !== null,
    draft:
      row.available_quantity === null
        ? null
        : {
            availableQuantity: Number(row.available_quantity),
            extraQuantity: Number(row.extra_quantity),
          },
    approved,
    hasInspection,
    currentRound:
      row.round_status !== null && row.round_trigger_type !== null
        ? { status: row.round_status, triggerType: row.round_trigger_type }
        : null,
    receipts,
  });
}
