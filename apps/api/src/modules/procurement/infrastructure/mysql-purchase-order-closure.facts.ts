import type { PoolConnection } from 'mysql2/promise';
import type { ReceiptQuantitySummary } from '@company/contracts';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import type { QualityInboundQuery } from '../../quality/public.js';
import { projectDraftOwnership } from '../domain/receipt-ownership.projection.js';
import { type ReceiptLineRow, readReceiptExecutionFacts } from './mysql-receipt.shared.js';
import { requireAggregateQuantity, requireQuantity } from '../domain/receipt-quantity.policy.js';

export const emptyClosureFacts = () => ({
  hasReceipt: false,
  quantities: {
    unprocessedQuantity: '0',
    receivedQuantity: '0',
    undeterminedQuantity: '0',
    approvedQuantity: '0',
    inboundQuantity: '0',
    returnDueQuantity: '0',
    returnedQuantity: '0',
    qualityReturnedQuantity: '0',
    pendingInboundQuantity: '0',
    pendingReturnQuantity: '0',
    hasOpenReview: false,
  } as ReceiptQuantitySummary,
  evidence: {
    receiptLineIds: [] as string[],
    roundIds: [] as string[],
    receiptRevisionIds: [] as string[],
    allocationIds: [] as string[],
    inspectionIds: [] as string[],
    inboundDetailIds: [] as string[],
    supplierReturnIds: [] as string[],
  },
});
export const purchaseLineClosureFacts = async (
  connection: PoolConnection,
  lineId: string,
  quality: QualityInboundQuery,
  inventory: InventoryInboundQuery,
) => {
  const [lines] = await connection.query<
    (ReceiptLineRow & {
      received_quantity: number;
      round_status: string;
      source_allocation_round_id: number | null;
    })[]
  >(
    `SELECT l.*,v.received_quantity,r.status round_status,r.source_allocation_round_id FROM procurement_receipt_line l JOIN procurement_receipt_revision v ON v.id=l.current_receipt_revision_id
      JOIN procurement_receipt_round r ON r.id=l.current_round_id WHERE l.purchase_order_line_id=? OR EXISTS(SELECT 1 FROM procurement_receipt_allocation a WHERE a.receipt_line_id=l.id AND a.purchase_order_line_id=?) ORDER BY l.id FOR UPDATE`,
    [lineId, lineId],
  );
  const result = emptyClosureFacts();
  if (!lines.length) return result;
  result.hasReceipt = true;
  const ids = lines.map((line) => String(line.id));
  const execution = await readReceiptExecutionFacts(connection, ids, inventory);
  const rows = execution.allocations;
  const origins = new Map(
    lines.map((line) => [String(line.id), String(line.purchase_order_line_id)]),
  );
  const current = new Set(lines.map((line) => String(line.current_round_id)));
  const owned = rows.filter(
    (row) =>
      String(row.purchase_order_line_id ?? origins.get(String(row.receipt_line_id))) === lineId,
  );
  const pending = projectDraftOwnership(
    lines.map((line) => ({
      receipt_line_id: line.id,
      purchase_order_line_id: line.purchase_order_line_id,
      round_id: line.current_round_id!,
      status: line.round_status,
      source_allocation_round_id: line.source_allocation_round_id,
      received_quantity: line.received_quantity,
    })),
    rows,
  ).filter((owner) => owner.purchaseOrderLineId === lineId);
  const active = owned.filter(
    (row) => current.has(String(row.round_id)) && row.round_status === 'finalized',
  );
  const inbound = owned.reduce((sum, row) => sum + row.inbound_quantity, 0),
    returned = owned.reduce((sum, row) => sum + row.returned_quantity, 0);
  const pendingInbound = active
    .filter((row) => row.disposition === 'inbound')
    .reduce((sum, row) => sum + row.remaining_quantity, 0);
  const pendingReturn = active
    .filter((row) => row.disposition === 'return')
    .reduce((sum, row) => sum + row.remaining_quantity, 0);
  const undetermined =
    active
      .filter((row) => row.disposition === 'pending')
      .reduce((sum, row) => sum + row.remaining_quantity, 0) +
    pending.reduce((sum, owner) => sum + owner.quantity, 0);
  const received = requireAggregateQuantity(
    [inbound, returned, pendingInbound, pendingReturn, undetermined],
    '采购行总到货量',
  );
  const qualityReturned = owned
    .filter((row) => row.return_reason === 'quality')
    .reduce((sum, row) => sum + row.returned_quantity, 0);
  for (const q of [inbound, returned, pendingInbound, pendingReturn, undetermined, qualityReturned])
    requireQuantity(q, '关闭依据数量', true);
  const ownedIds = new Set(owned.map((row) => String(row.id)));
  const inboundDetailIds = execution.inbounds.flatMap((fact) =>
    fact.receipts.filter((row) => ownedIds.has(row.allocationId)).map((row) => row.inboundDetailId),
  );
  let hasOpenReview = pending.some((owner) => owner.hasOpenReview);
  for (let offset = 0; offset < ids.length; offset += 100)
    hasOpenReview ||= (
      await quality.listOpenCases({ receiptLineIds: ids.slice(offset, offset + 100) })
    ).some(
      (record) =>
        current.has(record.roundId) &&
        (origins.get(record.receiptLineId) === lineId ||
          pending.some((owner) => owner.receiptLineId === record.receiptLineId)),
    );
  result.quantities = {
    unprocessedQuantity: String(undetermined + pendingInbound + pendingReturn),
    receivedQuantity: String(received),
    undeterminedQuantity: String(undetermined),
    approvedQuantity: String(inbound + pendingInbound),
    inboundQuantity: String(inbound),
    returnDueQuantity: String(returned + pendingReturn),
    returnedQuantity: String(returned),
    qualityReturnedQuantity: String(qualityReturned),
    pendingInboundQuantity: String(pendingInbound),
    pendingReturnQuantity: String(pendingReturn),
    hasOpenReview,
  };
  result.evidence = {
    receiptLineIds: ids,
    roundIds: [...current],
    receiptRevisionIds: lines.map((line) => String(line.current_receipt_revision_id)),
    allocationIds: owned
      .filter(
        (row) =>
          row.inbound_quantity + row.returned_quantity > 0 || current.has(String(row.round_id)),
      )
      .map((row) => String(row.id)),
    inspectionIds: [
      ...new Set(owned.flatMap((row) => (row.inspection_id ? [String(row.inspection_id)] : []))),
    ],
    inboundDetailIds,
    supplierReturnIds: execution.returns
      .filter((row) => ownedIds.has(String(row.allocation_id)))
      .map((row) => String(row.id)),
  };
  return result;
};
