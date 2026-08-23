import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  PageResult,
  ProductionBatchQuery,
  ProductionExecutionBatchSummary,
} from '@company/contracts';
import { BATCH_SELECT, mapBatch, type BatchRow } from './mysql-production.shared.js';
import { fixedIntegerQuantity } from '../domain/integer-quantity.js';

type ExecutionBatchRow = BatchRow & {
  completed_step_count: number;
  total_step_count: number;
  effective_abnormal: string;
  pending_abnormal_count: number;
};

export const selectExecutionBatchSummaries = async (
  pool: Pool,
  query: ProductionBatchQuery,
): Promise<PageResult<ProductionExecutionBatchSummary>> => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const conditions = ['1=1'];
  const values: Array<string | number> = [];
  if (query.keyword) {
    conditions.push(
      '(b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
    );
    values.push(...Array(4).fill(`%${query.keyword}%`));
  }
  if (query.status) {
    conditions.push('b.status=?');
    values.push(query.status);
  }
  const where = conditions.join(' AND ');
  const [[count]] = await pool.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id WHERE ${where}`,
    values,
  );
  const [rows] = await pool.query<ExecutionBatchRow[]>(
    `SELECT base.*,
      (SELECT COUNT(*) FROM batch_step_records sr WHERE sr.production_batch_id=base.id) total_step_count,
      (SELECT COUNT(*) FROM batch_step_records sr WHERE sr.production_batch_id=base.id AND sr.status='completed') completed_step_count,
      COALESCE((SELECT SUM(CASE WHEN r.report_type='normal' THEN r.abnormal_quantity ELSE -r.abnormal_quantity END)
        FROM batch_step_reports r WHERE r.production_batch_id=base.id),0) effective_abnormal,
      (SELECT COUNT(*) FROM batch_step_abnormal_dispositions d
        WHERE d.production_batch_id=base.id AND d.review_status='pending_review') pending_abnormal_count
     FROM (${BATCH_SELECT} WHERE ${where}) base
     ORDER BY base.created_at DESC,base.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => ({
      ...mapBatch(row),
      completedStepCount: Number(row.completed_step_count),
      totalStepCount: Number(row.total_step_count),
      effectiveAbnormalQuantity: fixedIntegerQuantity(row.effective_abnormal),
      pendingAbnormalCount: Number(row.pending_abnormal_count),
    })),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
};
