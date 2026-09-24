import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { ReceiptRoundStatus, ReceiptRoundTrigger } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { QualityInboundCommand } from '../../quality/public.js';
import {
  receiptError,
  requireAggregateQuantity,
  requireQuantity,
  type ReceiptLineRow,
  type RevisionRow,
  type AllocationRow,
} from './mysql-receipt.shared.js';

export type RoundRow = RowDataPacket & {
  id: number;
  receipt_line_id: number;
  round_no: number;
  previous_round_id: number | null;
  source_allocation_round_id: number | null;
  trigger_type: ReceiptRoundTrigger;
  receipt_revision_id: number;
  starting_quantity: number;
  status: ReceiptRoundStatus;
  inspection_id: number | null;
  reason: string;
  version: number;
};

export async function lockRound(
  db: PoolConnection,
  line: ReceiptLineRow,
  expected?: { roundId: string; roundVersion: number },
) {
  const [[round]] = await db.query<RoundRow[]>(
    'SELECT * FROM procurement_receipt_round WHERE id=? AND receipt_line_id=? FOR UPDATE',
    [line.current_round_id, line.id],
  );
  if (!round || round.status === 'superseded')
    return receiptError('当前处理轮次不存在或已失效', 'RECEIPT_STATE');
  if (expected)
    requireOptimisticUpdate(
      String(round.id) === expected.roundId && round.version === expected.roundVersion ? 1 : 0,
    );
  return round;
}

export async function receiptBalance(
  db: PoolConnection,
  line: ReceiptLineRow,
  allocations: AllocationRow[],
) {
  const [[revision]] = await db.query<RevisionRow[]>(
    'SELECT * FROM procurement_receipt_revision WHERE id=? AND receipt_line_id=? FOR SHARE',
    [line.current_receipt_revision_id, line.id],
  );
  if (!revision) return receiptError('当前实收修订不存在', 'RECEIPT_STATE');
  const inbound = allocations.reduce((sum, row) => sum + row.inbound_quantity, 0);
  const returned = allocations.reduce((sum, row) => sum + row.returned_quantity, 0);
  const remaining = Number(revision.received_quantity) - inbound - returned;
  requireQuantity(remaining, '本批未处置量', true);
  return { revision, inbound, returned, remaining };
}

export async function insertRound(
  db: PoolConnection,
  input: {
    lineId: string;
    revisionId: string;
    previous: RoundRow | null;
    trigger: ReceiptRoundTrigger;
    quantity: number;
    status: ReceiptRoundStatus;
    inspectionId?: string | null;
    reason: string;
  },
  context: CommandContext,
) {
  requireQuantity(input.quantity, '本轮实物量', true);
  // Carry only the last still-relevant allocation basis. A finalized empty round clears it.
  let sourceRoundId = input.previous?.source_allocation_round_id ?? null;
  if (input.previous?.status === 'finalized') {
    const [[source]] = await db.query<RowDataPacket[]>(
      'SELECT id FROM procurement_receipt_allocation WHERE round_id=? LIMIT 1 FOR SHARE',
      [input.previous.id],
    );
    sourceRoundId = source ? input.previous.id : null;
  }
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO procurement_receipt_round(receipt_line_id,round_no,previous_round_id,trigger_type,receipt_revision_id,
      starting_quantity,status,inspection_id,reason,created_by,updated_by,source_allocation_round_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.lineId,
      input.previous ? input.previous.round_no + 1 : 1,
      input.previous?.id ?? null,
      input.trigger,
      input.revisionId,
      input.quantity,
      input.status,
      input.inspectionId ?? null,
      input.reason,
      context.actorId,
      context.actorId,
      sourceRoundId,
    ],
  );
  await db.execute('UPDATE procurement_receipt_line SET current_round_id=? WHERE id=?', [
    result.insertId,
    input.lineId,
  ]);
  if (input.previous)
    await db.execute(
      "UPDATE procurement_receipt_round SET status='superseded',version=version+1,updated_by=? WHERE id=?",
      [context.actorId, input.previous.id],
    );
  const [[round]] = await db.query<RoundRow[]>(
    'SELECT * FROM procurement_receipt_round WHERE id=?',
    [result.insertId],
  );
  return round!;
}

export async function replaceRound(
  db: PoolConnection,
  line: ReceiptLineRow,
  previous: RoundRow,
  input: {
    revisionId?: string;
    quantity: number;
    trigger: ReceiptRoundTrigger;
    status: ReceiptRoundStatus;
    inspectionId?: string | null;
    reason: string;
  },
  context: CommandContext,
  quality?: QualityInboundCommand,
) {
  const next = await insertRound(
    db,
    {
      ...input,
      lineId: String(line.id),
      previous,
      revisionId: input.revisionId ?? String(line.current_receipt_revision_id),
    },
    context,
  );
  if (quality)
    await quality.supersedeCases(
      {
        receiptLineId: String(line.id),
        roundId: String(previous.id),
        supersededByRoundId: String(next.id),
        reason: input.reason,
      },
      context,
    );
  return next;
}

/** Source ownership survives review; an empty finalization cannot resurrect older grants. */
export function precedingAllocations(round: RoundRow, allocations: AllocationRow[]) {
  const sourceId = round.status === 'finalized' ? round.id : round.source_allocation_round_id;
  return sourceId === null
    ? []
    : allocations.filter(
        (row) => String(row.round_id) === String(sourceId) && row.remaining_quantity > 0,
      );
}

export async function assertReceiptAggregate(
  db: PoolConnection,
  line: ReceiptLineRow,
  total: number,
) {
  const [others] = await db.query<(RowDataPacket & { received_quantity: number })[]>(
    `SELECT r.received_quantity FROM procurement_receipt_line l JOIN procurement_receipt_revision r
     ON r.id=l.current_receipt_revision_id WHERE l.purchase_order_line_id=? AND l.id<>? FOR SHARE`,
    [line.purchase_order_line_id, line.id],
  );
  requireAggregateQuantity(
    [...others.map((r) => Number(r.received_quantity)), total],
    '采购行累计实收',
  );
}

export function requireNotRejected(round: RoundRow) {
  if (round.trigger_type === 'manual_rejection')
    receiptError('本轮已人工拒收，请先更正实收或撤销拒收重新办理', 'RECEIPT_STATE');
}
