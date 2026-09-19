import type { Pool, PoolConnection } from 'mysql2/promise';
import { ProductionDomainError } from '../../domain/production.errors.js';
import {
  FINISHED_SOURCE_COLUMNS,
  FINISHED_SOURCE_FROM,
  FINISHED_SOURCE_JOINS,
  type FinishedInboundOrderRow,
} from '../mysql-production-finished-inbound.read.js';
export const finishedOrderSelect =
  (): string => `SELECT ${FINISHED_SOURCE_COLUMNS},o.id inbound_id,o.inbound_no,o.source_type,o.status,o.version,
  o.output_revision_id,adopted.revision_no,d.id detail_id,d.inbound_number,d.requested_batch_code,d.batch_id,
  o.created_by,o.created_at,o.operator_id,o.inbound_at,o.remark,o.cancel_reason,o.cancelled_by,o.cancelled_at,
  (SELECT tx.id FROM inventory_transaction tx WHERE tx.product_id=o.product_id AND tx.reference_type='inbound_detail'
    AND tx.reference_detail_id=d.id AND tx.transaction_type='production_inbound') inventory_transaction_id
  FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id AND d.product_id=o.product_id
  JOIN production_batches b ON b.id=o.production_batch_id ${FINISHED_SOURCE_JOINS}
  JOIN production_output_revision adopted ON adopted.id=o.output_revision_id`;
export const finishedOrderCount =
  (): string => `SELECT COUNT(*) total FROM inbound_order o JOIN inbound_detail d ON d.inbound_id=o.id AND d.product_id=o.product_id
  JOIN production_batches b ON b.id=o.production_batch_id ${FINISHED_SOURCE_JOINS}
  JOIN production_output_revision adopted ON adopted.id=o.output_revision_id`;
export const finishedCandidateSelect = (): string => `SELECT ${FINISHED_SOURCE_COLUMNS},
 (SELECT o.id FROM inbound_order o WHERE o.production_batch_id=b.id AND o.source_type=? AND o.status='pending') pending_inbound_id,
 (SELECT o.id FROM inbound_order o WHERE o.production_batch_id=b.id AND o.source_type=? AND o.status='completed') completed_inbound_id
 ${FINISHED_SOURCE_FROM}`;
export async function findFinishedOrder(
  db: Pool | PoolConnection,
  id: string,
): Promise<FinishedInboundOrderRow> {
  const [[row]] = await db.query<FinishedInboundOrderRow[]>(
    `${finishedOrderSelect()} WHERE o.id=? AND o.source_type IN ('self_made','production_extra')`,
    [id],
  );
  if (!row) throw new ProductionDomainError('NOT_FOUND', '成品入库单不存在');
  return row;
}
