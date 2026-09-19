import type { RowDataPacket } from 'mysql2/promise';
import type {
  FinishedGoodsInboundSource,
  FinishedGoodsInboundCandidate,
  FinishedGoodsInboundOrderItem,
  ProductionBatchStatus,
  InboundOrderStatus,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';

export type FinishedInboundSourceRow = RowDataPacket & {
  production_batch_id: number;
  batch_no: string;
  batch_status: ProductionBatchStatus;
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code: string;
  product_name: string;
  unit: string;
  closeout_id: number;
  current_revision_id: number;
  current_revision_no: number;
  approved_available_quantity: string;
  approved_extra_quantity: string;
  draft_available_quantity: string | null;
  draft_extra_quantity: string | null;
  pending_approval_id: number | null;
  correction_reason: string | null;
  pending_inbound_id: number | null;
  completed_inbound_id: number | null;
};
export type FinishedInboundOrderRow = FinishedInboundSourceRow & {
  inbound_id: number | string;
  inbound_no: string;
  source_type: FinishedGoodsInboundSource;
  status: InboundOrderStatus;
  version: number;
  output_revision_id: number | string;
  revision_no: number;
  detail_id: number | string;
  inbound_number: string;
  requested_batch_code: string;
  batch_id: number | string | null;
  inventory_transaction_id: number | string | null;
  created_by: number | string;
  created_at: Date;
  operator_id: number | string | null;
  inbound_at: Date | null;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | string | null;
  cancelled_at: Date | null;
};
export const FINISHED_SOURCE_COLUMNS = `b.id production_batch_id,b.batch_no,b.status batch_status,
  wo.id work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,wo.unit_snapshot unit,c.id closeout_id,c.current_revision_id,
  r.revision_no current_revision_no,r.available_quantity approved_available_quantity,r.extra_quantity approved_extra_quantity,
  c.available_quantity draft_available_quantity,c.extra_quantity draft_extra_quantity,c.pending_approval_id,c.correction_reason`;
export const FINISHED_SOURCE_JOINS = `JOIN work_orders wo ON wo.id=b.work_order_id
  JOIN production_batch_closeout c ON c.production_batch_id=b.id
  JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id`;
export const FINISHED_SOURCE_FROM = `FROM production_batches b ${FINISHED_SOURCE_JOINS}`;
export const FINISHED_SOURCE_SELECT = `SELECT ${FINISHED_SOURCE_COLUMNS} ${FINISHED_SOURCE_FROM}`;

export function approvedFinishedQuantity(
  row: FinishedInboundSourceRow,
  source: FinishedGoodsInboundSource,
): string {
  return String(
    source === 'self_made' ? row.approved_available_quantity : row.approved_extra_quantity,
  );
}
export function finishedInboundBlockers(
  row: FinishedInboundSourceRow,
  source: FinishedGoodsInboundSource,
): string[] {
  const blockers: string[] = [];
  if (row.batch_status !== 'completed' && row.batch_status !== 'terminated')
    blockers.push('任务尚未批准结案');
  if (Number(approvedFinishedQuantity(row, source)) <= 0)
    blockers.push('当前批准清单的该类可入库数量为零');
  const draft = source === 'self_made' ? row.draft_available_quantity : row.draft_extra_quantity;
  if (
    row.pending_approval_id !== null &&
    row.correction_reason !== null &&
    Number(draft) !== Number(approvedFinishedQuantity(row, source))
  ) {
    blockers.push('该类产出数量正在更正审批，暂不能入库；请等待审批结果');
  }
  return blockers;
}
export function mapFinishedCandidate(
  row: FinishedInboundSourceRow,
  source: FinishedGoodsInboundSource,
): FinishedGoodsInboundCandidate {
  const blockers = finishedInboundBlockers(row, source);
  if (row.completed_inbound_id !== null) blockers.push('本任务该类产出已经整批入库');
  if (row.pending_inbound_id !== null) blockers.push('该类已有待确认入库单，请继续办理原单');
  return {
    productionBatchId: String(row.production_batch_id),
    batchNo: row.batch_no,
    workOrderId: String(row.work_order_id),
    workOrderNo: row.work_order_no,
    productId: String(row.product_id),
    productCode: row.product_code,
    productName: row.product_name,
    unit: row.unit,
    sourceType: source,
    outputRevisionId: String(row.current_revision_id),
    revisionNo: Number(row.current_revision_no),
    approvedQuantity: approvedFinishedQuantity(row, source),
    pendingInboundId: nullableId(row.pending_inbound_id),
    completedInboundId: nullableId(row.completed_inbound_id),
    canCreate: blockers.length === 0,
    blockers,
  };
}
export function mapFinishedOrder(row: FinishedInboundOrderRow): FinishedGoodsInboundOrderItem {
  const blockers = finishedInboundBlockers(row, row.source_type);
  if (row.status !== 'pending')
    blockers.push(row.status === 'completed' ? '该入库单已确认' : '该入库单已取消');
  const canEdit = row.status === 'pending' && blockers.length === 0;
  if (String(row.output_revision_id) !== String(row.current_revision_id))
    blockers.push('批准清单已有新版，请核对最新数量并保存后再确认');
  if (Number(row.inbound_number) !== Number(approvedFinishedQuantity(row, row.source_type)))
    blockers.push('草稿数量与最新批准清单不一致，请刷新核对');
  return {
    inboundId: String(row.inbound_id),
    inboundNo: row.inbound_no,
    sourceType: row.source_type,
    status: row.status,
    version: row.version,
    productionBatchId: String(row.production_batch_id),
    batchNo: row.batch_no,
    workOrderId: String(row.work_order_id),
    workOrderNo: row.work_order_no,
    productId: String(row.product_id),
    productCode: row.product_code,
    productName: row.product_name,
    unit: row.unit,
    outputRevisionId: String(row.output_revision_id),
    currentOutputRevisionId: String(row.current_revision_id),
    revisionNo: Number(row.revision_no),
    inboundQuantity: String(row.inbound_number),
    batchCode: row.requested_batch_code,
    itemBatchId: nullableId(row.batch_id),
    inventoryTransactionId: nullableId(row.inventory_transaction_id),
    createdById: String(row.created_by),
    createdByName: String(row.created_by),
    createdAt: toBeijingISOString(row.created_at),
    operatorId: nullableId(row.operator_id),
    operatorName: nullableId(row.operator_id),
    inboundAt: date(row.inbound_at),
    remark: row.remark,
    cancelReason: row.cancel_reason,
    cancelledById: nullableId(row.cancelled_by),
    cancelledByName: nullableId(row.cancelled_by),
    cancelledAt: date(row.cancelled_at),
    canEdit,
    canConfirm: row.status === 'pending' && blockers.length === 0,
    canCancel: row.status === 'pending' && row.batch_id === null,
    blockers,
  };
}
const nullableId = (id: number | string | null) => (id === null ? null : String(id));
const date = (value: Date | null) => (value ? toBeijingISOString(value) : null);
