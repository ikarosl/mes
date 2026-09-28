import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  FinishedInspectionTaskItem,
  FinishedInspectionTaskQuery,
  PageResult,
  ProductionOutputQuantities,
  ProductionOutputReleaseDecision,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
type Db = Pool | PoolConnection;
type TaskRow = RowDataPacket & {
  batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  planned_quantity: string;
  version: number;
  current_round_id: number | null;
  current_round_status: FinishedInspectionTaskItem['currentRoundStatus'];
  latest_id: number | null;
  release_decision: ProductionOutputReleaseDecision | null;
  inspected_at: Date | null;
  pending_approval_id: number | null;
  current_revision_id: number | null;
  correction_reason: string | null;
  available_quantity: string | null;
  extra_quantity: string | null;
  additional_scrap_quantity: string | null;
  status: string;
};
const SELECT = `SELECT b.id batch_id,b.batch_no,b.work_order_id,w.work_order_no,w.product_code_snapshot,w.product_name_snapshot,b.planned_quantity,b.status,c.version,c.current_round_id,round.status current_round_status,c.pending_approval_id,c.current_revision_id,c.correction_reason,c.available_quantity,c.extra_quantity,c.additional_scrap_quantity,i.id latest_id,i.release_decision,i.inspected_at FROM production_batch_closeout c LEFT JOIN production_output_round round ON round.id=c.current_round_id JOIN production_batches b ON b.id=c.production_batch_id JOIN work_orders w ON w.id=b.work_order_id
 LEFT JOIN quality_inspection_record i ON i.id=(SELECT MAX(latest.id) FROM quality_inspection_record latest WHERE latest.closeout_id=c.id)`;
function mapTask(row: TaskRow): FinishedInspectionTaskItem {
  return {
    batchId: String(row.batch_id),
    batchNo: row.batch_no,
    workOrderId: String(row.work_order_id),
    workOrderNo: row.work_order_no,
    productCode: row.product_code_snapshot,
    productName: row.product_name_snapshot,
    plannedQuantity: String(row.planned_quantity),
    version: row.version,
    currentRoundId: row.current_round_id === null ? null : String(row.current_round_id),
    currentRoundStatus: row.current_round_status,
    latestInspectionId: row.latest_id === null ? null : String(row.latest_id),
    latestReleaseDecision: row.release_decision,
    latestInspectedAt: row.inspected_at === null ? null : toBeijingISOString(row.inspected_at),
    canStartInspection:
      ['closing', 'completed', 'terminated'].includes(row.status) &&
      row.pending_approval_id === null &&
      (row.current_revision_id === null || row.correction_reason !== null) &&
      row.available_quantity !== null &&
      row.current_round_status === 'pending_inspection',
    canRecordInspection:
      ['closing', 'completed', 'terminated'].includes(row.status) &&
      row.pending_approval_id === null &&
      (row.current_revision_id === null || row.correction_reason !== null) &&
      row.available_quantity !== null &&
      row.current_round_status === 'inspecting',
  };
}
export async function listFinishedInspectionTasks(
  db: Db,
  query: FinishedInspectionTaskQuery,
): Promise<PageResult<FinishedInspectionTaskItem>> {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10,
    clauses: string[] = [],
    values: unknown[] = [];
  if (query.keyword?.trim()) {
    clauses.push(
      '(b.batch_no LIKE ? OR w.work_order_no LIKE ? OR w.product_code_snapshot LIKE ? OR w.product_name_snapshot LIKE ?)',
    );
    values.push(...Array(4).fill(`%${query.keyword.trim()}%`));
  }
  if (query.status === 'pending')
    clauses.push("(i.id IS NULL OR i.release_decision='pending_reinspection')");
  if (query.status === 'recorded') clauses.push('i.id IS NOT NULL');
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM (${SELECT}${where}) matching_tasks`,
    values,
  );
  const [rows] = await db.query<TaskRow[]>(
    `${SELECT}${where} ORDER BY c.updated_at DESC,c.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapTask), total: Number(count?.total ?? 0), page, pageSize };
}
export async function readFinishedInspectionTask(
  db: Db,
  batchId: string,
): Promise<{
  item: FinishedInspectionTaskItem;
  declared: ProductionOutputQuantities | null;
} | null> {
  const [[row]] = await db.query<TaskRow[]>(`${SELECT} WHERE b.id=?`, [batchId]);
  return row
    ? {
        item: mapTask(row),
        declared:
          row.available_quantity === null
            ? null
            : {
                availableQuantity: Number(row.available_quantity),
                extraQuantity: Number(row.extra_quantity),
                additionalScrapQuantity: Number(row.additional_scrap_quantity),
              },
      }
    : null;
}
