import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { RecordReceiptHandlingPayload, ReceiptHandlingItem } from '@company/contracts';
import { PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH } from '@company/constants';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { lockReceiptLines, auditReceipt } from './mysql-receipt.shared.js';
import {
  RECEIPT_HANDLING_COLUMNS,
  mapReceiptHandling,
  type ReceiptHandlingRow,
} from './mysql-receipt-handling.shared.js';
import { receiptError } from '../domain/procurement.errors.js';

export async function recordReceiptHandling(
  db: PoolConnection,
  receiptLineId: string,
  payload: RecordReceiptHandlingPayload,
  context: CommandContext,
): Promise<ReceiptHandlingItem> {
  const note = payload.otherHandlingNote.trim();
  if (!note || note.length > PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH)
    return receiptError('请填写 1 至 2000 字的其他处理说明');
  const [line] = await lockReceiptLines(db, [receiptLineId]);
  if (!line) return receiptError('到货明细不存在', 'RECEIPT_NOT_FOUND');
  const [inserted] = await db.execute<ResultSetHeader>(
    'INSERT INTO procurement_receipt_handling(receipt_line_id,inbound_id,other_handling_note,created_by) VALUES(?,NULL,?,?)',
    [receiptLineId, note, context.actorId],
  );
  const [[row]] = await db.query<ReceiptHandlingRow[]>(
    `SELECT ${RECEIPT_HANDLING_COLUMNS} FROM procurement_receipt_handling WHERE id=?`,
    [inserted.insertId],
  );
  if (!row) throw new Error('Inserted receipt handling could not be read');
  const item = mapReceiptHandling(row);
  await auditReceipt(db, context, 'receipt.handle', String(line.receipt_id), null, item);
  return item;
}
