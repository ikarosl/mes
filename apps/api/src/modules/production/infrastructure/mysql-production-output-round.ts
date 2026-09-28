import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { ProductionOutputRound, ProductionOutputRoundTrigger } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { readProductionOutputReceipts } from './mysql-production-output-receipts.js';
import { InventoryInboundCommand } from '../../inventory/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import type { CloseoutRow } from './mysql-production-output.persistence.js';

type RoundRow = RowDataPacket & {
  id: number;
  closeout_id: number;
  round_no: number;
  previous_round_id: number | null;
  trigger_type: ProductionOutputRoundTrigger;
  base_revision_id: number | null;
  source_version: number;
  baseline_planned_received: string;
  baseline_extra_received: string;
  starting_declared_remaining: string;
  status: ProductionOutputRound['status'];
  reason: string | null;
  version: number;
  created_at: Date;
};
export async function readOutputRounds(
  db: PoolConnection,
  closeoutId: number,
  lock: boolean,
): Promise<ProductionOutputRound[]> {
  const [rows] = await db.query<RoundRow[]>(
    `SELECT id,closeout_id,round_no,previous_round_id,trigger_type,base_revision_id,source_version,baseline_planned_received,baseline_extra_received,starting_declared_remaining,status,reason,version,created_at FROM production_output_round WHERE closeout_id=? ORDER BY round_no${lock ? ' FOR SHARE' : ''}`,
    [closeoutId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    closeoutId: String(row.closeout_id),
    roundNo: row.round_no,
    previousRoundId: row.previous_round_id === null ? null : String(row.previous_round_id),
    triggerType: row.trigger_type,
    baseRevisionId: row.base_revision_id === null ? null : String(row.base_revision_id),
    baselinePlannedReceived: String(row.baseline_planned_received),
    baselineExtraReceived: String(row.baseline_extra_received),
    startingDeclaredRemaining: String(row.starting_declared_remaining),
    status: row.status,
    reason: row.reason,
    version: row.version,
  }));
}
export async function startOutputRound(
  db: PoolConnection,
  row: CloseoutRow,
  inventory: InventoryInboundCommand,
  context: CommandContext,
  triggerType: ProductionOutputRoundTrigger,
  reason: string | null,
  declaredRemaining: number,
): Promise<string> {
  const receipts = await readProductionOutputReceipts(
    db,
    inventory,
    String(row.production_batch_id),
    true,
  );
  const planned = Number(receipts.productionReceivedQuantity);
  const extra = Number(receipts.extraReceivedQuantity);
  if (
    !Number.isSafeInteger(declaredRemaining) ||
    declaredRemaining < 0 ||
    declaredRemaining > 99_999_999
  )
    throw new ProductionDomainError('INVALID_INPUT', '剩余送检申报量无效');
  const [[previous]] = await db.query<(RowDataPacket & { round_no: number })[]>(
    'SELECT round_no FROM production_output_round WHERE id=? AND closeout_id=? FOR UPDATE',
    [row.current_round_id, row.id],
  );
  if (row.current_round_id !== null && !previous)
    throw new ProductionDomainError('INVALID_STATE', '当前产出办理轮次无效');
  if (row.current_round_id !== null)
    await db.execute(
      "UPDATE production_output_round SET status='superseded',version=version+1,updated_by=? WHERE id=?",
      [context.actorId, row.current_round_id],
    );
  const [created] = await db.execute<ResultSetHeader>(
    `INSERT INTO production_output_round
      (closeout_id,round_no,previous_round_id,trigger_type,base_revision_id,source_version,
       baseline_planned_received,baseline_extra_received,starting_declared_remaining,status,reason,created_by,updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,'pending_inspection',?,?,?)`,
    [
      row.id,
      (previous?.round_no ?? 0) + 1,
      row.current_round_id,
      triggerType,
      row.current_revision_id,
      row.version,
      planned,
      extra,
      declaredRemaining,
      reason,
      context.actorId,
      context.actorId,
    ],
  );
  await db.execute('UPDATE production_batch_closeout SET current_round_id=? WHERE id=?', [
    created.insertId,
    row.id,
  ]);
  return String(created.insertId);
}
