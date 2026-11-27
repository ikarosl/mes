import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  PageResult,
  ProductionDashboardQuery,
  ProductionDashboardFilter,
  ProductionDashboardScheduleItem,
  ProductionDashboardOptionKind,
  ProductionDashboardOptionQuery,
  ProductionDashboardOption,
  ProductionDashboardFlow,
  ProductionDashboardPeriodQuery,
  ProductionDashboardPeriodFlow,
  ProductionDashboardPeriodVisit,
  ProductionDashboardStep,
  ProductionDashboardPeriodStep,
  ProductionDashboardCardQuery,
  ProductionDashboardCard,
  ProductionDashboardOutputQuery,
  ProductionDashboardOutputItem,
  ProductionDashboardAbnormalityQuery,
  ProductionDashboardAbnormalityResult,
  ProductionDashboardAbnormalityItem,
  ProductionDashboardAbnormalityDetailQuery,
  ProductionDashboardAbnormalityDetail,
} from '@company/contracts';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import { toBeijingISOString } from '../../../../common/time/date-time.js';
import { ProductionDashboardRepository } from '../../application/ports/production-dashboard.repository.js';
import { ProductionDomainError } from '../../domain/production.errors.js';

const FROM = 'FROM work_orders wo LEFT JOIN production_batches b ON b.work_order_id=wo.id';
const COLUMNS = `CAST(wo.id AS CHAR) workOrderId,wo.work_order_no workOrderNo,
 DATE_FORMAT(wo.plan_start_date,'%Y-%m-%d') workOrderPlanStartDate,DATE_FORMAT(wo.plan_end_date,'%Y-%m-%d') workOrderPlanEndDate,
 CAST(wo.product_id AS CHAR) productId,wo.product_name_snapshot productName,wo.unit_snapshot unit,
 CAST(b.id AS CHAR) batchId,b.batch_no batchNo,b.status,
 CAST(COALESCE(b.planned_quantity,wo.planned_quantity) AS CHAR) plannedQuantity,
 DATE_FORMAT(IF(b.id IS NULL,wo.plan_start_date,b.plan_start_date),'%Y-%m-%d') planStartDate,
 DATE_FORMAT(IF(b.id IS NULL,wo.plan_end_date,b.plan_end_date),'%Y-%m-%d') planEndDate,
 b.started_at startedAt,COALESCE(b.completed_at,b.cancelled_at) endedAt`;
type ScheduleRow = RowDataPacket &
  Omit<ProductionDashboardScheduleItem, 'startedAt' | 'endedAt'> & {
    startedAt: Date | null;
    endedAt: Date | null;
  };
const nullableDate = (value: Date | null): string | null =>
  value === null ? null : toBeijingISOString(value);
const mapSchedule = (row: ScheduleRow): ProductionDashboardScheduleItem => ({
  ...row,
  startedAt: nullableDate(row.startedAt),
  endedAt: nullableDate(row.endedAt),
});
function filter(query: ProductionDashboardFilter): { sql: string; values: (string | number)[] } {
  const parts = ['1=1'];
  const values: (string | number)[] = [];
  for (const [column, value] of [
    ['wo.id', query.workOrderId],
    ['b.id', query.batchId],
    ['wo.product_id', query.productId],
    ['b.status', query.status],
  ]) {
    if (value) {
      parts.push(`${column}=?`);
      values.push(value);
    }
  }
  if (query.keyword) {
    parts.push(
      '(wo.work_order_no LIKE ? OR b.batch_no LIKE ? OR wo.product_name_snapshot LIKE ? OR wo.product_code_snapshot LIKE ?)',
    );
    values.push(...Array<string>(4).fill(`%${query.keyword}%`));
  }
  return { sql: parts.join(' AND '), values };
}
function scheduleFilter(query: ProductionDashboardQuery): ReturnType<typeof filter> {
  const result = filter(query);
  // Missing endpoints remain visible; no historical dates are inferred.
  result.sql += ` AND ((IF(b.id IS NULL,wo.plan_start_date,b.plan_start_date) IS NULL
    OR IF(b.id IS NULL,wo.plan_end_date,b.plan_end_date) IS NULL)
    OR (IF(b.id IS NULL,wo.plan_start_date,b.plan_start_date)<=? AND IF(b.id IS NULL,wo.plan_end_date,b.plan_end_date)>=?)
    OR (b.started_at<DATE_ADD(?,INTERVAL 1 DAY) AND COALESCE(b.completed_at,b.cancelled_at,NOW())>=?))`;
  result.values.push(query.endDate, query.startDate, query.endDate, query.startDate);
  return result;
}
function paging(query: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

@Injectable()
export class MysqlProductionDashboardRepository extends ProductionDashboardRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }
  async abnormalityDetails(
    query: ProductionDashboardAbnormalityDetailQuery,
  ): Promise<PageResult<ProductionDashboardAbnormalityDetail>> {
    const { page, pageSize, offset } = paging(query);
    const scope = filter(query);
    const from = `FROM production_tracking_abnormality a JOIN production_tracking_card c ON c.id=a.tracking_card_id
      JOIN production_batches b ON b.id=c.production_batch_id JOIN work_orders wo ON wo.id=b.work_order_id
      LEFT JOIN batch_step_records s ON s.id=a.batch_step_record_id`;
    let where = `${scope.sql} AND a.created_at>=? AND a.created_at<DATE_ADD(?,INTERVAL 1 DAY)
      AND NOT EXISTS(SELECT 1 FROM production_tracking_abnormality_adjustment x WHERE x.abnormality_id=a.id AND x.kind='void')`;
    const values: (string | number)[] = [...scope.values, query.startDate, query.endDate];
    if (query.groupBy === 'reason') {
      where += ` AND EXISTS(SELECT 1 FROM production_tracking_abnormality_label_assignment assignment
        JOIN production_tracking_abnormality_label label ON label.id=assignment.label_id
        JOIN production_tracking_abnormality_label selected ON selected.id=?
        WHERE assignment.abnormality_id=a.id AND BINARY label.label=BINARY selected.label)`;
      values.push(query.groupKey);
    } else if (query.groupKey === 'unassigned') {
      where += ' AND a.batch_step_record_id IS NULL';
    } else {
      where += ` AND CAST(s.step_name_snapshot AS BINARY)=(
        SELECT CAST(step_name_snapshot AS BINARY) FROM batch_step_records WHERE id=?
      )`;
      values.push(query.groupKey);
    }
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total ${from} WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket &
        Omit<ProductionDashboardAbnormalityDetail, 'createdAt'> & { createdAt: Date })[]
    >(
      `SELECT CAST(a.id AS CHAR) id,CAST(c.id AS CHAR) cardId,c.card_no cardNo,CAST(b.id AS CHAR) batchId,b.batch_no batchNo,
      a.description,s.step_name_snapshot stepName,a.created_at createdAt ${from} WHERE ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );
    return {
      items: rows.map((row) => ({ ...row, createdAt: toBeijingISOString(row.createdAt) })),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async schedule(
    query: ProductionDashboardQuery,
  ): Promise<PageResult<ProductionDashboardScheduleItem>> {
    const { sql, values } = scheduleFilter(query);
    const { page, pageSize, offset } = paging(query);
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total ${FROM} WHERE ${sql}`,
      values,
    );
    const [rows] = await this.pool.query<ScheduleRow[]>(
      `SELECT ${COLUMNS} ${FROM} WHERE ${sql} ORDER BY wo.id DESC,b.id LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );
    return { items: rows.map(mapSchedule), total: Number(count?.total ?? 0), page, pageSize };
  }

  async options(
    kind: ProductionDashboardOptionKind,
    query: ProductionDashboardOptionQuery,
  ): Promise<PageResult<ProductionDashboardOption>> {
    const scope = filter(query);
    const search = filter({ keyword: query.search });
    if (query.onlyInProgress) {
      scope.sql += ` AND EXISTS(SELECT 1 FROM production_tracking_card c
        JOIN batch_step_records s ON s.id=c.current_step_record_id AND s.production_batch_id=b.id
        WHERE c.production_batch_id=b.id AND c.status='in_progress')`;
    }
    const sql = `(${scope.sql}) AND (${search.sql})`;
    const values = [...scope.values, ...search.values];
    const { page, pageSize, offset } = paging(query);
    const definitions = {
      'work-orders': {
        id: 'wo.id',
        label: "MAX(CONCAT(wo.work_order_no,' · ',wo.product_name_snapshot))",
      },
      tasks: { id: 'b.id', label: "MAX(CONCAT(b.batch_no,' · ',wo.work_order_no))" },
      products: {
        id: 'wo.product_id',
        label: "MAX(CONCAT(wo.product_code_snapshot,' · ',wo.product_name_snapshot))",
      },
    };
    const definition = definitions[kind];
    const grouped = `SELECT CAST(${definition.id} AS CHAR) id,${definition.label} label ${FROM} WHERE ${sql} AND ${definition.id} IS NOT NULL GROUP BY ${definition.id}`;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM (${grouped}) candidates`,
      values,
    );
    const [items] = await this.pool.query<(RowDataPacket & ProductionDashboardOption)[]>(
      `${grouped} ORDER BY ${definition.id} DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );
    return { items, total: Number(count?.total ?? 0), page, pageSize };
  }

  async periodFlow(
    batchId: string,
    query: ProductionDashboardPeriodQuery,
  ): Promise<ProductionDashboardPeriodFlow> {
    return withTransaction(this.pool, async (db) => {
      const range = [query.startDate, query.endDate];
      const [[batch]] = await db.query<(ScheduleRow & { routeCode: string | null })[]>(
        `SELECT ${COLUMNS},b.route_code_snapshot routeCode ${FROM} WHERE b.id=?`,
        [batchId],
      );
      if (!batch) throw new ProductionDomainError('NOT_FOUND', '生产任务不存在');
      const [steps] = await db.query<(RowDataPacket & ProductionDashboardPeriodStep)[]>(
        `SELECT CAST(s.id AS CHAR) id,s.step_name_snapshot name,s.step_order_snapshot AS \`order\`,
         COALESCE(v.arrivedCardCount,0) arrivedCardCount,COALESCE(v.completedCardCount,0) completedCardCount,
         CAST(COALESCE(v.reportedQuantity,0) AS CHAR) reportedQuantity,COALESCE(a.abnormalityCount,0) abnormalityCount
         FROM batch_step_records s LEFT JOIN (
           SELECT batch_step_record_id,
           SUM(IF(arrived_at>=? AND arrived_at<DATE_ADD(?,INTERVAL 1 DAY),1,0)) arrivedCardCount,
           SUM(IF(completed_at>=? AND completed_at<DATE_ADD(?,INTERVAL 1 DAY),1,0)) completedCardCount,
           SUM(IF(completed_at>=? AND completed_at<DATE_ADD(?,INTERVAL 1 DAY),reported_quantity,0)) reportedQuantity
           FROM production_tracking_visit WHERE production_batch_id=? GROUP BY batch_step_record_id
         ) v ON v.batch_step_record_id=s.id LEFT JOIN (
           SELECT a.batch_step_record_id,COUNT(*) abnormalityCount FROM production_tracking_abnormality a
           JOIN production_tracking_card c ON c.id=a.tracking_card_id
           WHERE a.created_at>=? AND a.created_at<DATE_ADD(?,INTERVAL 1 DAY) AND c.production_batch_id=?
           AND NOT EXISTS(SELECT 1 FROM production_tracking_abnormality_adjustment x WHERE x.abnormality_id=a.id AND x.kind='void')
           GROUP BY a.batch_step_record_id
         ) a ON a.batch_step_record_id=s.id
         WHERE s.production_batch_id=? ORDER BY s.step_order_snapshot,s.id`,
        [...range, ...range, ...range, batchId, ...range, batchId, batchId],
      );
      const [[totals]] = await db.query<
        (RowDataPacket & { outputQuantity: string; abnormalityCount: number })[]
      >(
        `SELECT (SELECT CAST(COALESCE(SUM(o.quantity),0) AS CHAR) FROM production_tracking_output o
          WHERE o.production_batch_id=? AND o.confirmed_at>=? AND o.confirmed_at<DATE_ADD(?,INTERVAL 1 DAY)
          AND NOT EXISTS(SELECT 1 FROM production_tracking_output_cancellation x WHERE x.production_output_id=o.id)) outputQuantity,
         (SELECT COUNT(*) FROM production_tracking_abnormality a JOIN production_tracking_card c ON c.id=a.tracking_card_id
          WHERE c.production_batch_id=? AND a.created_at>=? AND a.created_at<DATE_ADD(?,INTERVAL 1 DAY)
          AND NOT EXISTS(SELECT 1 FROM production_tracking_abnormality_adjustment x WHERE x.abnormality_id=a.id AND x.kind='void')) abnormalityCount`,
        [batchId, ...range, batchId, ...range],
      );
      if (!totals) throw new Error('期间流转汇总缺失');
      const { routeCode, ...task } = batch;
      return {
        batch: mapSchedule(task),
        routeCode,
        asOf: toBeijingISOString(new Date()),
        steps: steps.map((step) => ({
          ...step,
          order: Number(step.order),
          arrivedCardCount: Number(step.arrivedCardCount),
          completedCardCount: Number(step.completedCardCount),
          abnormalityCount: Number(step.abnormalityCount),
        })),
        outputQuantity: totals.outputQuantity,
        abnormalityCount: Number(totals.abnormalityCount),
      };
    });
  }

  async periodVisits(
    batchId: string,
    query: ProductionDashboardPeriodQuery,
  ): Promise<PageResult<ProductionDashboardPeriodVisit>> {
    const { page, pageSize, offset } = paging(query);
    const range = [query.startDate, query.endDate];
    let where = `v.production_batch_id=? AND ((v.arrived_at>=? AND v.arrived_at<DATE_ADD(?,INTERVAL 1 DAY))
      OR (v.completed_at>=? AND v.completed_at<DATE_ADD(?,INTERVAL 1 DAY)))`;
    const values = [batchId, ...range, ...range];
    if (query.stepId) {
      where += ' AND v.batch_step_record_id=?';
      values.push(query.stepId);
    }
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM production_tracking_visit v WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket &
        Omit<
          ProductionDashboardPeriodVisit,
          'arrivedAt' | 'completedAt' | 'arrivedInPeriod' | 'completedInPeriod'
        > & {
          arrivedAt: Date;
          completedAt: Date | null;
          arrivedInPeriod: number;
          completedInPeriod: number;
        })[]
    >(
      `SELECT CAST(v.id AS CHAR) id,CAST(c.id AS CHAR) cardId,c.card_no cardNo,s.step_name_snapshot stepName,
      v.arrived_at arrivedAt,v.completed_at completedAt,CAST(v.reported_quantity AS CHAR) reportedQuantity,v.personnel_name_snapshot personnelName,
      (v.arrived_at>=? AND v.arrived_at<DATE_ADD(?,INTERVAL 1 DAY)) arrivedInPeriod,
      COALESCE((v.completed_at>=? AND v.completed_at<DATE_ADD(?,INTERVAL 1 DAY)),0) completedInPeriod
      FROM production_tracking_visit v JOIN production_tracking_card c ON c.id=v.tracking_card_id
      JOIN batch_step_records s ON s.id=v.batch_step_record_id WHERE ${where}
      ORDER BY v.arrived_at DESC,v.id DESC LIMIT ? OFFSET ?`,
      [...range, ...range, ...values, pageSize, offset],
    );
    return {
      items: rows.map((row) => ({
        ...row,
        arrivedAt: toBeijingISOString(row.arrivedAt),
        completedAt: nullableDate(row.completedAt),
        arrivedInPeriod: Boolean(row.arrivedInPeriod),
        completedInPeriod: Boolean(row.completedInPeriod),
      })),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async flow(batchId: string): Promise<ProductionDashboardFlow> {
    return withTransaction(this.pool, async (db) => {
      const [[batch]] = await db.query<(ScheduleRow & { routeCode: string | null })[]>(
        `SELECT ${COLUMNS},b.route_code_snapshot routeCode ${FROM} WHERE b.id=?`,
        [batchId],
      );
      if (!batch) throw new ProductionDomainError('NOT_FOUND', '生产任务不存在');
      const [steps] = await db.query<
        (RowDataPacket &
          Omit<ProductionDashboardStep, 'oldestArrival'> & { oldestArrival: Date | null })[]
      >(
        `SELECT CAST(s.id AS CHAR) id,s.step_name_snapshot name,s.step_order_snapshot AS \`order\`,
         CAST(COALESCE(SUM(c.quantity),0) AS CHAR) quantity,COUNT(c.id) cardCount,MIN(v.arrived_at) oldestArrival,
         CAST(COALESCE((SELECT SUM(h.reported_quantity) FROM production_tracking_visit h WHERE h.batch_step_record_id=s.id AND h.completed_at IS NOT NULL),0) AS CHAR) reportedQuantity
         FROM batch_step_records s LEFT JOIN production_tracking_card c ON c.current_step_record_id=s.id AND c.status='in_progress'
         LEFT JOIN production_tracking_visit v ON v.tracking_card_id=c.id AND v.batch_step_record_id=s.id
         WHERE s.production_batch_id=? GROUP BY s.id ORDER BY s.step_order_snapshot,s.id`,
        [batchId],
      );
      const [[totals]] = await db.query<
        (RowDataPacket & {
          unusedQuantity: string;
          inProgressQuantity: string;
          outputQuantity: string;
        })[]
      >(
        `SELECT CAST(COALESCE(SUM(IF(status='unused',quantity,0)),0) AS CHAR) unusedQuantity,
         CAST(COALESCE(SUM(IF(status='in_progress',quantity,0)),0) AS CHAR) inProgressQuantity,
         (SELECT CAST(COALESCE(SUM(o.quantity),0) AS CHAR) FROM production_tracking_output o
          WHERE o.production_batch_id=? AND NOT EXISTS(SELECT 1 FROM production_tracking_output_cancellation x WHERE x.production_output_id=o.id)) outputQuantity
         FROM production_tracking_card WHERE production_batch_id=?`,
        [batchId, batchId],
      );
      if (!totals) throw new Error('生产看板汇总缺失');
      const { routeCode, ...task } = batch;
      return {
        batch: mapSchedule(task),
        routeCode,
        asOf: toBeijingISOString(new Date()),
        steps: steps.map((row) => ({
          ...row,
          order: Number(row.order),
          cardCount: Number(row.cardCount),
          oldestArrival: nullableDate(row.oldestArrival),
        })),
        unusedQuantity: totals.unusedQuantity,
        inProgressQuantity: totals.inProgressQuantity,
        outputQuantity: totals.outputQuantity,
      };
    });
  }

  async cards(
    batchId: string,
    query: ProductionDashboardCardQuery,
  ): Promise<PageResult<ProductionDashboardCard>> {
    const { page, pageSize, offset } = paging(query);
    const values: (string | number)[] = [batchId];
    let where = "c.production_batch_id=? AND c.status='in_progress'";
    if (query.stepId) {
      where += ' AND c.current_step_record_id=?';
      values.push(query.stepId);
    }
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM production_tracking_card c WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<
      (RowDataPacket & Omit<ProductionDashboardCard, 'arrivedAt'> & { arrivedAt: Date | null })[]
    >(
      `SELECT CAST(c.id AS CHAR) id,c.card_no cardNo,CAST(c.quantity AS CHAR) quantity,v.arrived_at arrivedAt,
       c.personnel_name_snapshot personnelName,(SELECT COUNT(*) FROM production_tracking_abnormality a WHERE a.tracking_card_id=c.id AND a.status='open') openAbnormalityCount
       FROM production_tracking_card c LEFT JOIN production_tracking_visit v ON v.tracking_card_id=c.id AND v.batch_step_record_id=c.current_step_record_id
       WHERE ${where} ORDER BY v.arrived_at,c.id LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );
    return {
      items: rows.map((row) => ({
        ...row,
        arrivedAt: nullableDate(row.arrivedAt),
        openAbnormalityCount: Number(row.openAbnormalityCount),
      })),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async output(
    query: ProductionDashboardOutputQuery,
  ): Promise<PageResult<ProductionDashboardOutputItem>> {
    const { page, pageSize, offset } = paging(query);
    const scope = query.groupBy === 'task' ? scheduleFilter(query) : filter(query);
    let grouped: string;
    let values: (string | number)[];
    if (query.groupBy === 'task') {
      // Lifetime task output is compared with lifetime task plan, not with a date-window fraction.
      grouped = `SELECT CAST(b.id AS CHAR) \`key\`,b.batch_no label,CAST(wo.product_id AS CHAR) productId,
       wo.product_name_snapshot productName,wo.unit_snapshot unit,CAST(b.planned_quantity AS CHAR) plannedQuantity,
       CAST(COALESCE((SELECT SUM(o.quantity) FROM production_tracking_output o WHERE o.production_batch_id=b.id
       AND NOT EXISTS(SELECT 1 FROM production_tracking_output_cancellation x WHERE x.production_output_id=o.id)),0) AS CHAR) outputQuantity
       ${FROM} WHERE ${scope.sql} AND b.id IS NOT NULL AND b.status<>'cancelled'`;
      values = scope.values;
    } else {
      grouped = `SELECT CONCAT(DATE_FORMAT(MIN(o.confirmed_at),'%Y-%m-%d'),':',wo.product_id,':',wo.unit_snapshot) \`key\`,
       DATE_FORMAT(o.confirmed_at,'%Y-%m-%d') label,CAST(wo.product_id AS CHAR) productId,
       MAX(wo.product_name_snapshot) productName,wo.unit_snapshot unit,NULL plannedQuantity,CAST(SUM(o.quantity) AS CHAR) outputQuantity
       FROM production_tracking_output o JOIN production_batches b ON b.id=o.production_batch_id JOIN work_orders wo ON wo.id=b.work_order_id
       WHERE ${scope.sql} AND o.confirmed_at>=? AND o.confirmed_at<DATE_ADD(?,INTERVAL 1 DAY)
       AND NOT EXISTS(SELECT 1 FROM production_tracking_output_cancellation x WHERE x.production_output_id=o.id)
       GROUP BY DATE_FORMAT(o.confirmed_at,'%Y-%m-%d'),wo.product_id,wo.unit_snapshot`;
      values = [...scope.values, query.startDate, query.endDate];
    }
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM (${grouped}) chart_rows`,
      values,
    );
    const [items] = await this.pool.query<(RowDataPacket & ProductionDashboardOutputItem)[]>(
      `${grouped} ORDER BY label,productId,unit,\`key\` LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );
    return { items, total: Number(count?.total ?? 0), page, pageSize };
  }

  async abnormalities(
    query: ProductionDashboardAbnormalityQuery,
  ): Promise<ProductionDashboardAbnormalityResult> {
    const { page, pageSize, offset } = paging(query);
    const scope = filter(query);
    const base = `FROM production_tracking_abnormality a JOIN production_tracking_card c ON c.id=a.tracking_card_id
      JOIN production_batches b ON b.id=c.production_batch_id JOIN work_orders wo ON wo.id=b.work_order_id`;
    const where = `${scope.sql} AND a.created_at>=? AND a.created_at<DATE_ADD(?,INTERVAL 1 DAY)
      AND NOT EXISTS(SELECT 1 FROM production_tracking_abnormality_adjustment x WHERE x.abnormality_id=a.id AND x.kind='void')`;
    const values = [...scope.values, query.startDate, query.endDate];
    const [[overall]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total ${base} WHERE ${where}`,
      values,
    );
    let grouped: string;
    if (query.groupBy === 'reason') {
      grouped = `SELECT CAST(MIN(label.id) AS CHAR) \`key\`,MAX(label.label) label,COUNT(DISTINCT a.id) count ${base}
        JOIN production_tracking_abnormality_label_assignment assignment ON assignment.abnormality_id=a.id
        JOIN production_tracking_abnormality_label label ON label.id=assignment.label_id
        WHERE ${where} GROUP BY BINARY label.label`;
    } else {
      // A representative step ID lets details resolve the same frozen name across tasks.
      grouped = `SELECT COALESCE(CAST(MIN(s.id) AS CHAR),'unassigned') \`key\`,
        COALESCE(MAX(s.step_name_snapshot),'未指定工序') label,COUNT(*) count
        ${base} LEFT JOIN batch_step_records s ON s.id=a.batch_step_record_id
        WHERE ${where} GROUP BY CAST(s.step_name_snapshot AS BINARY)`;
    }
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM (${grouped}) chart_rows`,
      values,
    );
    const [rows] = await this.pool.query<(RowDataPacket & ProductionDashboardAbnormalityItem)[]>(
      `${grouped} ORDER BY count DESC,\`key\` LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    );
    return {
      items: rows.map((row) => ({ ...row, count: Number(row.count) })),
      total: Number(count?.total ?? 0),
      abnormalityCount: Number(overall?.total ?? 0),
      page,
      pageSize,
    };
  }
}
