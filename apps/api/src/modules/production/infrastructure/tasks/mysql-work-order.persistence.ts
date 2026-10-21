import type { RowDataPacket } from 'mysql2/promise';
import type {
  WorkOrderCloseType,
  WorkOrderFinalOutput,
  WorkOrderItem,
  WorkOrderStatus,
  WorkOrderType,
} from '@company/contracts';
import { toBeijingISOString, toDateOnlyString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';
import { nullableBeijingDateTime as date } from '../shared/mysql-production-mapping.js';
import {
  workOrderAssignedQuantitySql,
  workOrderTerminatedPlanSql,
} from './mysql-work-order-allocation.sql.js';

export type WorkOrderRow = RowDataPacket & {
  final_available_quantity: string;
  final_extra_quantity: string;
  final_scrap_quantity: string;
  finalized_batch_count: number;
  closing_batch_count: number;
  pending_available_quantity: string;
  pending_extra_quantity: string;
  id: number;
  work_order_no: string;
  order_type: WorkOrderType;
  previous_research_order_id: number | null;
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  unit_snapshot: string;
  planned_quantity: string;
  assigned_quantity: string;
  terminated_planned_quantity: string;
  status: WorkOrderStatus;
  released_at: Date | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  close_type: WorkOrderCloseType | null;
  close_reason: string | null;
  closed_by: number | null;
  closed_at: Date | null;
  customer_name: string | null;
  quality_level: string | null;
  work_order_owner_id: number | null;
  plan_start_date: Date | string | null;
  plan_end_date: Date | string | null;
  external_order_no: string | null;
  remark: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export const WORK_ORDER_SELECT = `SELECT wo.id,wo.work_order_no,wo.order_type,wo.previous_research_order_id,wo.product_id,wo.product_code_snapshot,wo.product_name_snapshot,wo.unit_snapshot,wo.planned_quantity,wo.customer_name,wo.quality_level,wo.work_order_owner_id,wo.plan_start_date,wo.plan_end_date,${workOrderAssignedQuantitySql('wo.id')} assigned_quantity,${workOrderTerminatedPlanSql('wo.id')} terminated_planned_quantity,wo.status,wo.released_at,wo.cancel_reason,wo.cancelled_by,wo.cancelled_at,wo.close_type,wo.close_reason,wo.closed_by,wo.closed_at,wo.external_order_no,wo.remark,wo.version,wo.created_at,wo.updated_at,
  COALESCE((SELECT SUM(round.baseline_planned_received+COALESCE((SELECT a.quantity FROM production_output_allocation a WHERE a.revision_id=r.id AND a.category='self_made'),0)) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    JOIN production_output_round round ON round.id=r.round_id
    WHERE r.work_order_id=wo.id),0) final_available_quantity,
  COALESCE((SELECT SUM(round.baseline_extra_received+COALESCE((SELECT a.quantity FROM production_output_allocation a WHERE a.revision_id=r.id AND a.category='production_extra'),0)) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    JOIN production_output_round round ON round.id=r.round_id
    WHERE r.work_order_id=wo.id),0) final_extra_quantity,
  COALESCE((SELECT SUM(r.additional_scrap_quantity+r.existing_scrap_quantity) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    WHERE r.work_order_id=wo.id),0) final_scrap_quantity,
  (SELECT COUNT(*) FROM production_batch_closeout c
    JOIN production_output_revision r ON r.id=c.current_revision_id AND r.closeout_id=c.id
    WHERE r.work_order_id=wo.id) finalized_batch_count,
  (SELECT COUNT(*) FROM production_batches b WHERE b.work_order_id=wo.id AND b.status='closing') closing_batch_count,
  COALESCE((SELECT SUM(c.available_quantity) FROM production_batch_closeout c JOIN production_batches b ON b.id=c.production_batch_id
    WHERE b.work_order_id=wo.id AND b.status='closing'),0) pending_available_quantity,
  COALESCE((SELECT SUM(c.extra_quantity) FROM production_batch_closeout c JOIN production_batches b ON b.id=c.production_batch_id
    WHERE b.work_order_id=wo.id AND b.status='closing'),0) pending_extra_quantity
  FROM work_orders wo`;

export async function findWorkOrder(db: Db, id: string, lock = false): Promise<WorkOrderRow> {
  const [rows] = await db.query<WorkOrderRow[]>(
    `${WORK_ORDER_SELECT} WHERE wo.id=?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产工单不存在');
  return rows[0];
}

export const mapWorkOrderFinalOutput = (row: WorkOrderRow): WorkOrderFinalOutput => ({
  availableQuantity: String(row.final_available_quantity ?? '0'),
  extraQuantity: String(row.final_extra_quantity ?? '0'),
  scrapQuantity: String(row.final_scrap_quantity ?? '0'),
  totalQuantity: String(
    Number(row.final_available_quantity ?? 0) +
      Number(row.final_extra_quantity ?? 0) +
      Number(row.final_scrap_quantity ?? 0),
  ),
  plannedShortfallQuantity: String(
    Number(row.planned_quantity) - Number(row.final_available_quantity ?? 0),
  ),
  finalizedBatchCount: Number(row.finalized_batch_count ?? 0),
  closingBatchCount: Number(row.closing_batch_count ?? 0),
  pendingAvailableQuantity: String(row.pending_available_quantity ?? '0'),
  pendingExtraQuantity: String(row.pending_extra_quantity ?? '0'),
});

export const mapWorkOrder = (row: WorkOrderRow): WorkOrderItem => ({
  finalOutput: mapWorkOrderFinalOutput(row),
  id: String(row.id),
  workOrderNo: row.work_order_no,
  orderType: row.order_type,
  previousResearchOrderId:
    row.previous_research_order_id === null ? null : String(row.previous_research_order_id),
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  unit: row.unit_snapshot,
  plannedQuantity: String(row.planned_quantity),
  customerName: row.customer_name,
  qualityLevel: row.quality_level,
  workOrderOwnerId: row.work_order_owner_id === null ? null : String(row.work_order_owner_id),
  planStartDate: toDateOnlyString(row.plan_start_date),
  planEndDate: toDateOnlyString(row.plan_end_date),
  assignedQuantity: String(row.assigned_quantity),
  terminatedPlannedQuantity: String(row.terminated_planned_quantity),
  status: row.status,
  releasedAt: date(row.released_at),
  cancelReason: row.cancel_reason,
  cancelledBy: row.cancelled_by === null ? null : String(row.cancelled_by),
  cancelledByName: null,
  cancelledAt: date(row.cancelled_at),
  closeType: row.close_type,
  closeReason: row.close_reason,
  closedBy: row.closed_by === null ? null : String(row.closed_by),
  closedByName: null,
  closedAt: date(row.closed_at),
  externalOrderNo: row.external_order_no,
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});

export const workOrderAudit = (row: WorkOrderRow) => ({
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  unit: row.unit_snapshot,
  plannedQuantity: String(row.planned_quantity),
  customerName: row.customer_name,
  qualityLevel: row.quality_level,
  workOrderOwnerId: row.work_order_owner_id === null ? null : String(row.work_order_owner_id),
  planStartDate: toDateOnlyString(row.plan_start_date),
  planEndDate: toDateOnlyString(row.plan_end_date),
  externalOrderNo: row.external_order_no,
  remark: row.remark,
  version: row.version,
});
