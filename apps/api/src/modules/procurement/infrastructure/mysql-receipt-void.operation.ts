import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  VoidProcurementReceiptPayload,
  VoidProcurementReceiptCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import type { QualityInboundCommand } from '../../quality/public.js';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import { receiptError } from '../domain/procurement.errors.js';
import {
  receiptVoidBlockedReason,
  receiptVoidVersionsMatch,
} from '../domain/receipt-void.policy.js';
import {
  RECEIPT_LINE_COLUMNS,
  type ReceiptLineRow,
  auditReceipt,
  lockReceiptRoots,
  readReceiptExecutionFacts,
  touchReceiptLine,
} from './mysql-receipt.shared.js';
import { insertRound, lockRound, receiptBalance } from './mysql-receipt-round.shared.js';
import { readReceiptDependentPurchases } from './mysql-receipt-void.shared.js';

export async function voidProcurementReceipt(
  db: PoolConnection,
  id: string,
  payload: VoidProcurementReceiptPayload,
  context: CommandContext,
  quality: QualityInboundCommand,
  inventory: InventoryInboundQuery,
): Promise<VoidProcurementReceiptCommandResult> {
  const reason = payload.reason.trim();
  if (!reason || reason.length > 2000) return receiptError('请填写 1 至 2000 字的作废原因');
  const [[receipt]] = await db.query<(RowDataPacket & { purchase_order_id: number })[]>(
    'SELECT purchase_order_id FROM procurement_receipt WHERE id=?',
    [id],
  );
  if (!receipt) return receiptError('到货单不存在', 'RECEIPT_NOT_FOUND');
  const [locators] = await db.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM procurement_receipt_line WHERE receipt_id=? ORDER BY id',
    [id],
  );
  await lockReceiptRoots(
    db,
    locators.map((row) => String(row.id)),
    [String(receipt.purchase_order_id)],
  );
  const [lines] = await db.query<ReceiptLineRow[]>(
    `SELECT ${RECEIPT_LINE_COLUMNS} FROM procurement_receipt_line
      WHERE receipt_id=? ORDER BY id FOR UPDATE`,
    [id],
  );
  // 采购根、到货行锁顺序与行写命令一致，再锁定主单校验登记版本。
  const [[registration]] = await db.query<
    (RowDataPacket & { is_voided: number; version: number })[]
  >('SELECT is_voided,version FROM procurement_receipt WHERE id=? FOR UPDATE', [id]);
  if (!registration) return receiptError('到货单不存在', 'RECEIPT_NOT_FOUND');
  requireOptimisticUpdate(registration.version === payload.version ? 1 : 0);
  if (Number(registration.is_voided) === 1)
    return receiptError('该到货登记已作废，不能继续办理，请刷新', 'RECEIPT_STATE');
  const locked = [];
  for (const line of lines) {
    const round = await lockRound(db, line);
    locked.push({ line, round });
  }
  const actual = locked.map(({ line, round }) => ({
    receiptLineId: String(line.id),
    version: line.version,
    roundId: String(round.id),
    roundVersion: round.version,
  }));
  // 全单集合与每行、每轮均须匹配，不能用分页子集部分作废。
  requireOptimisticUpdate(receiptVoidVersionsMatch(payload.lines, actual) ? 1 : 0);
  const ids = lines.map((line) => String(line.id));
  const dependentPurchaseNos = await readReceiptDependentPurchases(db, ids, true);
  const facts = await readReceiptExecutionFacts(db, ids, inventory);
  const blockedReason = receiptVoidBlockedReason({
    isVoided: Number(registration.is_voided) === 1,
    hasExecution:
      facts.inbounds.some((line) => Number(line.inboundQuantity) > 0) ||
      facts.returns.some((fact) => Number(fact.returned_quantity) > 0),
    dependentPurchaseNos,
  });
  if (blockedReason) return receiptError(blockedReason, 'RECEIPT_STATE');
  const prepared = [];
  for (const source of locked) {
    const balance = await receiptBalance(
      db,
      source.line,
      facts.allocations.filter(
        (allocation) => String(allocation.receipt_line_id) === String(source.line.id),
      ),
    );
    prepared.push({ ...source, remaining: balance.remaining });
  }
  const [updated] = await db.execute<ResultSetHeader>(
    `UPDATE procurement_receipt SET is_voided=1,void_reason=?,voided_by=?,voided_at=CURRENT_TIMESTAMP,
      updated_by=?,version=version+1 WHERE id=? AND version=? AND is_voided=0`,
    [reason, context.actorId, context.actorId, id, payload.version],
  );
  requireOptimisticUpdate(updated.affectedRows);
  const terminalRounds = [];
  for (const { line, round, remaining } of prepared) {
    const next = await insertRound(
      db,
      {
        lineId: String(line.id),
        revisionId: String(line.current_receipt_revision_id),
        previous: round,
        trigger: 'receipt_void',
        quantity: remaining,
        status: 'voided',
        reason,
      },
      context,
    );
    terminalRounds.push({ receiptLineId: String(line.id), roundId: String(next.id) });
    await touchReceiptLine(db, String(line.id), context);
  }
  // 终止该到货各历史轮次仍在途的办理，已完成结果保持不可变。
  for (const terminal of terminalRounds)
    await quality.supersedeReceiptCases(
      {
        receiptLineId: terminal.receiptLineId,
        supersededByRoundId: terminal.roundId,
        reason,
      },
      context,
    );
  const result = { receiptId: id, version: registration.version + 1 };
  await auditReceipt(
    db,
    context,
    'receipt.void',
    id,
    {
      isVoided: Number(registration.is_voided) === 1,
      version: registration.version,
      lines: actual,
    },
    {
      ...result,
      isVoided: true,
      reason,
      lines: terminalRounds,
    },
  );
  return result;
}
