import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  PageQuery,
  PageResult,
  ProcessInspectionEntry,
  ProcessInspectionQuery,
  ProcessInspectionStepSummary,
} from '@company/contracts';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import type { ProcessInspectionSource } from '../../application/quality-process-inspection.command.js';
import {
  mapProcessInspectionEntry,
  mapProcessInspectionRecord,
  mapProcessInspectionStep,
  PROCESS_INSPECTION_ROOT_COLUMNS,
  PROCESS_INSPECTION_RECORD_COLUMNS,
  type ProcessInspectionRootRow,
  type ProcessInspectionRecordRow,
  type ProcessInspectionStepRow,
} from '../mysql-process-inspection.mapper.js';

type StepSummaryRow = ProcessInspectionStepRow & {
  inspection_count: string | number;
  active_inspection_count: string | number;
  qualified_quantity: string | number;
  unqualified_quantity: string | number;
  accepted_quantity: string | number;
  pending_quantity: string | number;
  latest_inspected_at: Date | null;
};
const SOURCE_SELECT = `SELECT b.id batch_id,b.batch_no,b.status batch_status,w.id work_order_id,w.work_order_no,s.id step_id,s.status step_status,s.step_order_snapshot,s.step_code_snapshot,s.step_name_snapshot,s.unit_snapshot,w.product_code_snapshot,w.product_name_snapshot,c.pending_approval_id FROM batch_step_records s JOIN production_batches b ON b.id=s.production_batch_id JOIN work_orders w ON w.id=b.work_order_id LEFT JOIN production_batch_closeout c ON c.production_batch_id=b.id`;
const SOURCE_COLUMNS =
  'batch_id,batch_no,batch_status,work_order_id,work_order_no,step_id,step_status,step_order_snapshot,step_code_snapshot,step_name_snapshot,unit_snapshot,product_code_snapshot,product_name_snapshot,pending_approval_id';
const ELIGIBLE =
  "source.batch_status='doing' AND source.step_status IN('doing','completed') AND source.pending_approval_id IS NULL";
const TOTALS_SELECT = `SELECT q.batch_step_record_id,COUNT(*) inspection_count,COUNT(q.current_record_id) active_inspection_count,COALESCE(SUM(r.qualified_quantity),0) qualified_quantity,COALESCE(SUM(r.unqualified_quantity),0) unqualified_quantity,SUM(q.accepted_quantity) accepted_quantity,SUM(COALESCE(r.unqualified_quantity,0)-q.accepted_quantity) pending_quantity,MAX(r.inspected_at) latest_inspected_at FROM quality_process_inspection q LEFT JOIN quality_process_inspection_record r ON r.id=q.current_record_id GROUP BY q.batch_step_record_id`;
const SUMMARY_SELECT = `SELECT ${SOURCE_COLUMNS.split(',')
  .map((column) => `source.${column}`)
  .join(
    ',',
  )},COALESCE(t.inspection_count,0) inspection_count,COALESCE(t.active_inspection_count,0) active_inspection_count,COALESCE(t.qualified_quantity,0) qualified_quantity,COALESCE(t.unqualified_quantity,0) unqualified_quantity,COALESCE(t.accepted_quantity,0) accepted_quantity,COALESCE(t.pending_quantity,0) pending_quantity,t.latest_inspected_at FROM (${SOURCE_SELECT}) source LEFT JOIN (${TOTALS_SELECT}) t ON t.batch_step_record_id=source.step_id WHERE (t.inspection_count>0 OR (${ELIGIBLE}))`;

function keywordFilter(keyword: string | undefined, values: (string | number)[]): string {
  if (!keyword) return '';
  const pattern = `%${keyword}%`;
  values.push(pattern, pattern, pattern, pattern, pattern, pattern);
  return ' AND (source.batch_no LIKE ? OR source.work_order_no LIKE ? OR source.product_code_snapshot LIKE ? OR source.product_name_snapshot LIKE ? OR source.step_code_snapshot LIKE ? OR source.step_name_snapshot LIKE ?)';
}
function createBlockedReason(row: ProcessInspectionStepRow): string | null {
  if (row.batch_status !== 'doing') return '任务不在执行中，不能登记检查或新增专检处置';
  if (row.pending_approval_id !== null) return '结案或产出更正在审批，不能登记检查或新增专检处置';
  if (!['doing', 'completed'].includes(row.step_status)) return '工序尚未开工或已终止';
  return null;
}
function mapStepSummary(row: StepSummaryRow): ProcessInspectionStepSummary {
  const blockedReason = createBlockedReason(row);
  return {
    ...mapProcessInspectionStep(row),
    inspectionCount: Number(row.inspection_count),
    activeInspectionCount: Number(row.active_inspection_count),
    qualifiedQuantity: Number(row.qualified_quantity),
    unqualifiedQuantity: Number(row.unqualified_quantity),
    acceptedQuantity: Number(row.accepted_quantity),
    pendingQuantity: Number(row.pending_quantity),
    latestInspectedAt:
      row.latest_inspected_at === null ? null : toBeijingISOString(row.latest_inspected_at),
    canCreate: blockedReason === null,
    createBlockedReason: blockedReason,
  };
}
export async function listProcessInspectionSteps(
  db: PoolConnection,
  query: ProcessInspectionQuery,
): Promise<PageResult<ProcessInspectionStepSummary>> {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10;
  const values: (string | number)[] = [];
  let filter = keywordFilter(query.keyword, values);
  if (query.batchId) {
    filter += ' AND source.batch_id=?';
    values.push(query.batchId);
  }
  if (query.stepId) {
    filter += ' AND source.step_id=?';
    values.push(query.stepId);
  }
  if (query.pendingOnly === 'true') filter += ' AND source.pending_quantity>0';
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total FROM (${SUMMARY_SELECT}) source WHERE 1=1${filter}`,
    values,
  );
  const [rows] = await db.query<StepSummaryRow[]>(
    `SELECT ${SOURCE_COLUMNS},inspection_count,active_inspection_count,qualified_quantity,unqualified_quantity,accepted_quantity,pending_quantity,latest_inspected_at FROM (${SUMMARY_SELECT}) source WHERE 1=1${filter} ORDER BY source.batch_id DESC,source.step_order_snapshot,source.step_id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapStepSummary), total: Number(count?.total ?? 0), page, pageSize };
}
export async function readProcessInspectionStep(
  db: PoolConnection,
  stepId: string,
): Promise<ProcessInspectionStepSummary | null> {
  const [[row]] = await db.query<StepSummaryRow[]>(`${SUMMARY_SELECT} AND source.step_id=?`, [
    stepId,
  ]);
  return row ? mapStepSummary(row) : null;
}
export async function readProcessInspectionEntries(
  db: PoolConnection,
  ids: string[],
  source?: ProcessInspectionSource,
): Promise<ProcessInspectionEntry[]> {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  const [rows] = await db.query<(ProcessInspectionRootRow & ProcessInspectionStepRow)[]>(
    `SELECT ${PROCESS_INSPECTION_ROOT_COLUMNS.split(',')
      .map((column) => `q.${column}`)
      .join(',')},${SOURCE_COLUMNS.split(',')
      .map((column) => `source.${column}`)
      .join(
        ',',
      )} FROM quality_process_inspection q JOIN (${SOURCE_SELECT}) source ON source.step_id=q.batch_step_record_id AND source.batch_id=q.production_batch_id WHERE q.id IN(${marks})${source ? ' AND q.production_batch_id=? AND q.batch_step_record_id=?' : ''}`,
    source ? [...ids, source.batchId, source.stepId] : ids,
  );
  const recordIds = rows.flatMap((row) =>
    row.current_record_id === null ? [] : [String(row.current_record_id)],
  );
  const recordRows = recordIds.length
    ? (
        await db.query<ProcessInspectionRecordRow[]>(
          `SELECT ${PROCESS_INSPECTION_RECORD_COLUMNS} FROM quality_process_inspection_record WHERE id IN(${recordIds.map(() => '?').join(',')})`,
          recordIds,
        )
      )[0]
    : [];
  const byId = new Map(recordRows.map((row) => [String(row.id), mapProcessInspectionRecord(row)]));
  const mapped = new Map(
    rows.map((row) => {
      const currentRecord =
        row.current_record_id === null ? null : (byId.get(String(row.current_record_id)) ?? null);
      const pendingQuantity =
        (currentRecord?.unqualifiedQuantity ?? 0) - Number(row.accepted_quantity);
      const acceptBlockedReason =
        pendingQuantity <= 0 ? '没有待处理不合格数量' : createBlockedReason(row);
      return [
        String(row.id),
        mapProcessInspectionEntry(
          row,
          mapProcessInspectionStep(row),
          currentRecord,
          acceptBlockedReason,
        ),
      ] as const;
    }),
  );
  return ids.flatMap((id) => (mapped.has(id) ? [mapped.get(id)!] : []));
}
export async function listProcessInspectionEntries(
  db: PoolConnection,
  stepId: string,
  query: PageQuery,
): Promise<PageResult<ProcessInspectionEntry>> {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10;
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) total FROM quality_process_inspection WHERE batch_step_record_id=?',
    [stepId],
  );
  const [rows] = await db.query<(RowDataPacket & { id: string })[]>(
    'SELECT id FROM quality_process_inspection WHERE batch_step_record_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',
    [stepId, pageSize, (page - 1) * pageSize],
  );
  return {
    items: await readProcessInspectionEntries(
      db,
      rows.map((row) => String(row.id)),
    ),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}

export async function listPendingProcessInspectionEntries(
  db: PoolConnection,
  source: ProcessInspectionSource,
  query: PageQuery,
): Promise<PageResult<ProcessInspectionEntry>> {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 10;
  const filter = `FROM quality_process_inspection q
    JOIN quality_process_inspection_record r ON r.id=q.current_record_id AND r.inspection_id=q.id
    WHERE q.production_batch_id=? AND q.batch_step_record_id=?
      AND r.unqualified_quantity>q.accepted_quantity`;
  const values = [source.batchId, source.stepId];
  const [[count]] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) total ${filter}`,
    values,
  );
  const [rows] = await db.query<(RowDataPacket & { id: string })[]>(
    `SELECT q.id ${filter} ORDER BY q.created_at DESC,q.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return {
    items: await readProcessInspectionEntries(
      db,
      rows.map((row) => String(row.id)),
      source,
    ),
    total: Number(count?.total ?? 0),
    page,
    pageSize,
  };
}
