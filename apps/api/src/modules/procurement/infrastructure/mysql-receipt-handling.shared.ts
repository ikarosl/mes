import type { RowDataPacket } from 'mysql2/promise';
import type { ReceiptHandlingItem } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';

export const RECEIPT_HANDLING_COLUMNS =
  'id,receipt_line_id,inbound_id,other_handling_note,created_by,created_at';
export type ReceiptHandlingRow = RowDataPacket & {
  id: number | string;
  receipt_line_id: number | string;
  inbound_id: number | string | null;
  other_handling_note: string;
  created_by: number | string;
  created_at: Date;
};
export function mapReceiptHandling(row: ReceiptHandlingRow): ReceiptHandlingItem {
  return {
    id: String(row.id),
    receiptLineId: String(row.receipt_line_id),
    inboundId: row.inbound_id === null ? null : String(row.inbound_id),
    otherHandlingNote: row.other_handling_note,
    createdBy: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
  };
}
