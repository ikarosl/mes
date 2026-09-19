import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ReceiptQuantitySummary } from '@company/contracts';
import type { InventoryInboundQuery } from '../../inventory/public.js';
import type { QualityInboundQuery } from '../../quality/public.js';
import { idsSql } from './mysql-purchase-order.shared.js';
import {
  type ReceiptLineRow,
  type ScopeRow,
  receiptError,
  requireAggregateQuantity,
  requireQuantity,
} from './mysql-receipt.shared.js';

export const emptyClosureFacts = () => ({
  hasReceipt: false,
  quantities: {
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
    receiptRevisionIds: [] as string[],
    scopeIds: [] as string[],
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
  const [lines] = await connection.query<(ReceiptLineRow & { received_quantity: number })[]>(
    'SELECT l.*,r.received_quantity FROM procurement_receipt_line l JOIN procurement_receipt_revision r ON r.id=l.current_receipt_revision_id WHERE l.purchase_order_line_id=? ORDER BY l.id FOR UPDATE',
    [lineId],
  );
  const result = emptyClosureFacts();
  if (!lines.length) return result;
  const ids = lines.map((line) => String(line.id));
  result.hasReceipt = true;
  const [scopes] = await connection.query<ScopeRow[]>(
    `SELECT * FROM procurement_receipt_scope WHERE receipt_line_id IN (${idsSql(ids)}) ORDER BY receipt_line_id,id FOR UPDATE`,
    ids,
  );
  let hasOpenReview = false;
  for (let offset = 0; offset < ids.length; offset += 100)
    hasOpenReview =
      (await quality.listOpenCases({ receiptLineIds: ids.slice(offset, offset + 100) })).length >
        0 || hasOpenReview;
  const [returns] = await connection.query<
    (RowDataPacket & { id: number; returned_quantity: number; reason_type: string })[]
  >(
    `SELECT id,returned_quantity,reason_type FROM procurement_supplier_return WHERE receipt_line_id IN (${idsSql(ids)}) ORDER BY id FOR SHARE`,
    ids,
  );
  let inbound = 0;
  const inboundIds: string[] = [];
  for (let offset = 0; offset < ids.length; offset += 100)
    for (const fact of await inventory.getReceiptInboundFacts({
      receiptLineIds: ids.slice(offset, offset + 100),
    })) {
      inbound += Number(fact.inboundQuantity);
      inboundIds.push(...fact.receipts.map((row) => row.inboundDetailId));
    }
  const active = scopes.filter((scope) => scope.disposition !== 'superseded');
  const sum = (states: string[]) =>
    active
      .filter((scope) => states.includes(scope.disposition))
      .reduce((total, scope) => total + Number(scope.quantity), 0);
  const received = requireAggregateQuantity(
    lines.map((line) => Number(line.received_quantity)),
    '关闭依据累计实收',
  );
  const returned = returns.reduce((total, row) => total + Number(row.returned_quantity), 0);
  const qualityReturned = returns
    .filter((row) => row.reason_type === 'quality')
    .reduce((total, row) => total + Number(row.returned_quantity), 0);
  const pendingInbound = sum(['approved']);
  const pendingReturn = sum(['quality_return', 'termination_return']);
  const undetermined = sum(['uninspected', 'reviewing']);
  for (const quantity of [
    undetermined,
    inbound + pendingInbound,
    inbound,
    returned + pendingReturn,
    returned,
    qualityReturned,
  ])
    requireQuantity(quantity, '采购关闭依据数量', true);
  if (
    sum(['inbounded']) !== inbound ||
    sum(['returned']) !== returned ||
    received !== undetermined + pendingInbound + inbound + pendingReturn + returned
  )
    return receiptError('到货处置范围与真实入库／退回事实不一致', 'RECEIPT_STATE');
  result.quantities = {
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
    receiptRevisionIds: lines.map((line) => String(line.current_receipt_revision_id)),
    scopeIds: active.map((scope) => String(scope.id)),
    inspectionIds: [
      ...new Set(
        active.flatMap((scope) =>
          scope.inspection_id === null ? [] : [String(scope.inspection_id)],
        ),
      ),
    ],
    inboundDetailIds: inboundIds,
    supplierReturnIds: returns.map((row) => String(row.id)),
  };
  return result;
};
