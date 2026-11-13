import type { ProductionOutputItem } from '@company/contracts';
import type { RowDataPacket } from 'mysql2/promise';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import type { Db } from '../shared/mysql-production-db.js';

export type OutputRow = RowDataPacket &
  ProductionOutputItem & {
    cancellationId: string | null;
    cancellationReason: string | null;
    cancellationCreatedBy: string | null;
    cancellationCreatedAt: Date | null;
    inboundId?: string | null;
    inboundNo?: string | null;
    itemBatchId?: string | null;
    batchCode?: string | null;
    inboundQuantity?: string | null;
  };

export const PRODUCTION_OUTPUT_COLUMNS = `CAST(o.id AS CHAR) id,CAST(o.production_batch_id AS CHAR) productionBatchId,
 CAST(o.tracking_card_id AS CHAR) trackingCardId,CAST(o.quantity AS CHAR) quantity,
 CAST(o.personnel_id AS CHAR) personnelId,o.personnel_code_snapshot personnelCode,o.personnel_name_snapshot personnelName,
 CAST(o.confirmed_by AS CHAR) confirmedBy,o.confirmed_at confirmedAt,o.remark,
 b.batch_no batchNo,wo.work_order_no workOrderNo,CAST(o.product_id AS CHAR) productId,
 wo.product_code_snapshot productCode,wo.product_name_snapshot productName,wo.unit_snapshot unit,c.card_no cardNo,
 CAST(x.id AS CHAR) cancellationId,x.reason cancellationReason,CAST(x.created_by AS CHAR) cancellationCreatedBy,x.created_at cancellationCreatedAt`;
export const PRODUCTION_OUTPUT_FROM = `FROM production_tracking_output o
 JOIN production_batches b ON b.id=o.production_batch_id JOIN work_orders wo ON wo.id=o.work_order_id
 LEFT JOIN production_tracking_card c ON c.id=o.tracking_card_id
 LEFT JOIN production_tracking_output_cancellation x ON x.production_output_id=o.id`;

export function mapProductionOutput(row: OutputRow): ProductionOutputItem {
  let cancellation: ProductionOutputItem['cancellation'] = null;
  if (row.cancellationId !== null) {
    if (
      row.cancellationReason === null ||
      row.cancellationCreatedBy === null ||
      row.cancellationCreatedAt === null
    )
      throw new Error('产出撤销事实不完整');
    cancellation = {
      id: row.cancellationId,
      reason: row.cancellationReason,
      createdBy: row.cancellationCreatedBy,
      createdAt: toBeijingISOString(row.cancellationCreatedAt),
    };
  }
  let inbound: ProductionOutputItem['inbound'] = null;
  if (row.inboundId) {
    if (!row.inboundNo || !row.itemBatchId || !row.batchCode || row.inboundQuantity == null)
      throw new Error('产出入库事实不完整');
    inbound = {
      inboundId: row.inboundId,
      inboundNo: row.inboundNo,
      itemBatchId: row.itemBatchId,
      batchCode: row.batchCode,
      inboundQuantity: String(row.inboundQuantity),
    };
  }
  let status: ProductionOutputItem['status'] = 'pending_inbound';
  if (cancellation) status = 'cancelled';
  else if (inbound) status = 'inbounded';
  else if (Number(row.quantity) === 0) status = 'no_inbound_required';
  return {
    id: row.id,
    productionBatchId: row.productionBatchId,
    trackingCardId: row.trackingCardId,
    quantity: String(row.quantity),
    personnelId: row.personnelId,
    personnelCode: row.personnelCode,
    personnelName: row.personnelName,
    confirmedBy: row.confirmedBy,
    confirmedAt: toBeijingISOString(row.confirmedAt),
    remark: row.remark,
    batchNo: row.batchNo,
    workOrderNo: row.workOrderNo,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    unit: row.unit,
    cardNo: row.cardNo,
    status,
    cancellation,
    inbound,
  };
}

/** 写命令只锁 Production 所有对象；实际接收资格另经 Inventory 当前读。 */
export async function selectProductionOutputForCommand(
  db: Db,
  outputId: string,
  expectedBatchId: string,
): Promise<ProductionOutputItem> {
  const [[row]] = await db.query<OutputRow[]>(
    `SELECT ${PRODUCTION_OUTPUT_COLUMNS} ${PRODUCTION_OUTPUT_FROM} WHERE o.id=? AND o.production_batch_id=? FOR UPDATE`,
    [outputId, expectedBatchId],
  );
  if (!row)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '所选产出不存在或不属于当前任务，请刷新后重试',
    );
  return mapProductionOutput(row);
}
