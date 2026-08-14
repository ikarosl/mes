import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateWorkOrderPayload,
  PageResult,
  UpdateWorkOrderPayload,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderOption,
  WorkOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type { ProductionProductSnapshot } from '../../product/public.js';
import { requireWorkOrderTransition } from '../domain/production-status.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import {
  BATCH_SELECT,
  type Db,
  ensureNoDuplicate,
  findWorkOrder,
  mapBatch,
  mapWorkOrder,
  type WorkOrderRow,
  WORK_ORDER_SELECT,
  workOrderAudit,
} from './mysql-production.shared.js';

type WorkOrderBatchSummaryRow = RowDataPacket & {
  id: number;
  batch_no: string;
  status:
    | 'pending'
    | 'material_pending'
    | 'material_assigned'
    | 'material_outbound'
    | 'doing'
    | 'completed'
    | 'cancelled';
  planned_quantity: string;
  completed_quantity: string;
};

@Injectable()
export class MysqlWorkOrderRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async list(query: WorkOrderQuery): Promise<PageResult<WorkOrderItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['1=1'];
    const values: Array<string | number> = [];
    if (query.keyword) {
      conditions.push(
        '(wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
      );
      values.push(`%${query.keyword}%`, `%${query.keyword}%`, `%${query.keyword}%`);
    }
    if (query.productId) {
      conditions.push('wo.product_id=?');
      values.push(query.productId);
    }
    if (query.status) {
      conditions.push('wo.status=?');
      values.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM work_orders wo WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<WorkOrderRow[]>(
      `${WORK_ORDER_SELECT} WHERE ${where} ORDER BY wo.created_at DESC,wo.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(mapWorkOrder), total: Number(count?.total ?? 0), page, pageSize };
  }

  async listWorkOrderOptions(): Promise<WorkOrderOption[]> {
    const remaining = `(wo.planned_quantity - COALESCE((SELECT SUM(b.planned_quantity) FROM production_batches b WHERE b.work_order_id=wo.id AND b.status<>'cancelled'),0))`;
    const conditions = [`wo.status IN ('released','doing')`, `${remaining} > 0`];
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        work_order_no: string;
        product_id: number;
        product_code_snapshot: string;
        product_name_snapshot: string;
        remaining_quantity: string;
      })[]
    >(
      `SELECT wo.id,wo.work_order_no,wo.product_id,wo.product_code_snapshot,wo.product_name_snapshot,${remaining} AS remaining_quantity
         FROM work_orders wo
         WHERE ${conditions.join(' AND ')}
         ORDER BY wo.work_order_no ASC,wo.id ASC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      workOrderNo: row.work_order_no,
      productId: String(row.product_id),
      productCode: row.product_code_snapshot,
      productName: row.product_name_snapshot,
      remainingQuantity: row.remaining_quantity,
    }));
  }

  async get(id: string): Promise<WorkOrderDetail> {
    return this.getDetail(this.pool, id);
  }

  async getProductId(id: string): Promise<string> {
    const [[row]] = await this.pool.query<(RowDataPacket & { product_id: number })[]>(
      'SELECT product_id FROM work_orders WHERE id=?',
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产工单不存在');
    return String(row.product_id);
  }

  async create(
    payload: CreateWorkOrderPayload,
    product: ProductionProductSnapshot,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const [[existing]] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM work_orders WHERE work_order_no=? FOR UPDATE',
        [payload.workOrderNo],
      );
      if (existing) throw new ProductionDomainError('CONFLICT', '工单号已存在');
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO work_orders (work_order_no,product_id,product_code_snapshot,product_name_snapshot,unit_snapshot,planned_quantity,customer_name,quality_level,work_order_owner_id,plan_start_date,plan_end_date,external_order_no,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          payload.workOrderNo,
          product.id,
          product.itemCode,
          product.productName,
          product.unit,
          payload.plannedQuantity,
          payload.customerName ?? null,
          payload.qualityLevel ?? null,
          payload.workOrderOwnerId ?? null,
          payload.planStartDate ?? null,
          payload.planEndDate ?? null,
          payload.externalOrderNo ?? null,
          payload.remark ?? null,
          audit.actorId,
          audit.actorId,
        ],
      );
      await this.audit(
        connection,
        audit,
        'work-order.create',
        String(result.insertId),
        null,
        payload,
      );
      return this.getDetail(connection, String(result.insertId));
    }).catch((error) => ensureNoDuplicate(error, '单据编号或幂等键已存在'));
  }

  async update(
    id: string,
    payload: UpdateWorkOrderPayload,
    product: ProductionProductSnapshot | undefined,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await findWorkOrder(connection, id);
      if (before.status !== 'draft')
        throw new ProductionDomainError('INVALID_STATE', '只有草稿工单可以编辑');
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE work_orders SET product_id=?,product_code_snapshot=?,product_name_snapshot=?,unit_snapshot=?,planned_quantity=?,customer_name=?,quality_level=?,work_order_owner_id=?,plan_start_date=?,plan_end_date=?,external_order_no=?,remark=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [
          product?.id ?? before.product_id,
          product?.itemCode ?? before.product_code_snapshot,
          product?.productName ?? before.product_name_snapshot,
          product?.unit ?? before.unit_snapshot,
          payload.plannedQuantity === undefined ? before.planned_quantity : payload.plannedQuantity,
          payload.customerName === undefined ? before.customer_name : payload.customerName,
          payload.qualityLevel === undefined ? before.quality_level : payload.qualityLevel,
          payload.workOrderOwnerId === undefined
            ? before.work_order_owner_id
            : payload.workOrderOwnerId,
          payload.planStartDate === undefined ? before.plan_start_date : payload.planStartDate,
          payload.planEndDate === undefined ? before.plan_end_date : payload.planEndDate,
          payload.externalOrderNo === undefined
            ? before.external_order_no
            : payload.externalOrderNo,
          payload.remark === undefined ? before.remark : payload.remark,
          audit.actorId,
          id,
          payload.version,
        ],
      );
      this.assertVersion(result, '工单已被其他操作修改，请刷新后重试');
      await this.audit(connection, audit, 'work-order.update', id, workOrderAudit(before), {
        ...payload,
        ...(product
          ? {
              productId: product.id,
              productCode: product.itemCode,
              productName: product.productName,
              unit: product.unit,
            }
          : {}),
      });
      return this.getDetail(connection, id);
    });
  }

  async withReleaseTransaction<T>(
    workOrderId: string,
    action: (workOrderProductId: string) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (connection) => {
      const order = await findWorkOrder(connection, workOrderId, true);
      requireWorkOrderTransition(order.status, 'released');
      return action(String(order.product_id));
    });
  }

  async release(
    id: string,
    version: number,
    product: ProductionProductSnapshot,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await findWorkOrder(connection, id, true);
      requireWorkOrderTransition(before.status, 'released');
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE work_orders SET product_id=?,product_code_snapshot=?,product_name_snapshot=?,unit_snapshot=?,status='released',released_at=NOW(),version=version+1,updated_by=? WHERE id=? AND version=?`,
        [
          product.id,
          product.itemCode,
          product.productName,
          product.unit,
          audit.actorId,
          id,
          version,
        ],
      );
      this.assertVersion(result, '工单已被其他操作修改，请刷新后重试');
      await this.audit(connection, audit, 'work-order.release', id, workOrderAudit(before), {
        status: 'released',
        productId: product.id,
        productCode: product.itemCode,
        productName: product.productName,
        unit: product.unit,
      });
      return this.getDetail(connection, id);
    });
  }

  async cancel(id: string, version: number, audit: CommandContext): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await findWorkOrder(connection, id, true);
      requireWorkOrderTransition(before.status, 'cancelled');
      const batches = await this.lockBatchSummaries(connection, id);
      if (batches.length > 0)
        throw new ProductionDomainError(
          'INVALID_STATE',
          '已有生产批次的工单不能按草稿取消，请核对工单状态',
        );
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE work_orders SET status='cancelled',version=version+1,updated_by=? WHERE id=? AND status='draft' AND version=?`,
        [audit.actorId, id, version],
      );
      this.assertVersion(result, '工单已被其他操作修改，请刷新后重试');
      await this.audit(
        connection,
        audit,
        'work-order.cancel',
        id,
        { status: before.status, version: before.version },
        { status: 'cancelled', version: version + 1 },
      );
      return this.getDetail(connection, id);
    });
  }

  async complete(id: string, version: number, audit: CommandContext): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await findWorkOrder(connection, id, true);
      requireWorkOrderTransition(before.status, 'completed');
      if (before.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '工单已被其他操作修改，请刷新后重试',
        );
      const batches = await this.lockBatchSummaries(connection, id);
      const activeBatches = batches.filter((batch) => batch.status !== 'cancelled');
      const unfinishedBatches = activeBatches.filter((batch) => batch.status !== 'completed');
      const completedQuantity = sumCompletedQuantity(activeBatches);
      if (
        activeBatches.length === 0 ||
        unfinishedBatches.length > 0 ||
        scaledQuantity(completedQuantity) !== scaledQuantity(before.planned_quantity)
      ) {
        throw new ProductionDomainError(
          'WORK_ORDER_COMPLETION_NOT_ALLOWED',
          '工单尚未达到足量完工条件，请核对所属生产批次',
          workOrderBatchDetails(before.planned_quantity, completedQuantity, unfinishedBatches),
        );
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE work_orders SET status='completed',version=version+1,updated_by=? WHERE id=? AND status IN ('released','doing') AND version=?`,
        [audit.actorId, id, version],
      );
      this.assertVersion(result, '工单已被其他操作修改，请刷新后重试');
      await this.audit(
        connection,
        audit,
        'work-order.complete',
        id,
        { status: before.status, version: before.version },
        {
          status: 'completed',
          plannedQuantity: before.planned_quantity,
          completedQuantity,
          completedBatchCount: activeBatches.length,
          version: version + 1,
        },
      );
      return this.getDetail(connection, id);
    });
  }

  async close(
    id: string,
    version: number,
    reason: string | null,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await findWorkOrder(connection, id, true);
      requireWorkOrderTransition(before.status, 'closed');
      if (before.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '工单已被其他操作修改，请刷新后重试',
        );
      const batches = await this.lockBatchSummaries(connection, id);
      const activeBatches = batches.filter((batch) => batch.status !== 'cancelled');
      const unfinishedBatches = activeBatches.filter((batch) => batch.status !== 'completed');
      const completedQuantity = sumCompletedQuantity(activeBatches);
      const isEarlyClose = before.status === 'released' || before.status === 'doing';
      if (isEarlyClose && unfinishedBatches.length > 0)
        throw new ProductionDomainError(
          'WORK_ORDER_CLOSE_NOT_ALLOWED',
          '请先完成或取消所有未结束生产批次',
          workOrderBatchDetails(before.planned_quantity, completedQuantity, unfinishedBatches),
        );
      if (isEarlyClose && !reason)
        throw new ProductionDomainError('INVALID_INPUT', '提前关闭工单必须填写关闭原因');
      if (
        isEarlyClose &&
        activeBatches.length > 0 &&
        scaledQuantity(completedQuantity) === scaledQuantity(before.planned_quantity)
      )
        throw new ProductionDomainError(
          'WORK_ORDER_CLOSE_NOT_ALLOWED',
          '生产数量已足量完成，请先确认工单完工，再执行归档关闭',
        );
      const closeType =
        before.status === 'completed'
          ? 'completed_archive'
          : activeBatches.length === 0
            ? 'unproduced'
            : 'underproduced';
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE work_orders SET status='closed',version=version+1,updated_by=? WHERE id=? AND status=? AND version=?`,
        [audit.actorId, id, before.status, version],
      );
      this.assertVersion(result, '工单已被其他操作修改，请刷新后重试');
      await this.audit(
        connection,
        audit,
        'work-order.close',
        id,
        { status: before.status, version: before.version },
        {
          status: 'closed',
          closeType,
          reason,
          plannedQuantity: before.planned_quantity,
          completedQuantity,
          version: version + 1,
        },
      );
      return this.getDetail(connection, id);
    });
  }

  private async lockBatchSummaries(
    connection: PoolConnection,
    workOrderId: string,
  ): Promise<WorkOrderBatchSummaryRow[]> {
    const [rows] = await connection.query<WorkOrderBatchSummaryRow[]>(
      `SELECT id,batch_no,status,planned_quantity,completed_quantity
       FROM production_batches
       WHERE work_order_id=?
       ORDER BY id
       FOR UPDATE`,
      [workOrderId],
    );
    return rows;
  }

  private async getDetail(db: Db, id: string): Promise<WorkOrderDetail> {
    const order = await findWorkOrder(db, id);
    const [batches] = await db.query(
      `${BATCH_SELECT} WHERE b.work_order_id=? ORDER BY b.created_at DESC,b.id DESC`,
      [id],
    );
    return { ...mapWorkOrder(order), batches: (batches as never[]).map(mapBatch) };
  }

  private assertVersion(result: ResultSetHeader, message: string): void {
    if (result.affectedRows !== 1)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', message);
  }

  private async audit(
    connection: PoolConnection,
    audit: CommandContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ): Promise<void> {
    await writeTransactionalAudit(connection, {
      logType: 'business',
      module: 'production',
      action,
      userId: audit.actorId,
      targetId,
      targetType: 'work_order',
      result: 'success',
      beforeData,
      afterData,
      requestId: audit.requestId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
  }
}

const scaledQuantity = (value: string): number => Math.round(Number(value) * 10_000);

const sumCompletedQuantity = (batches: WorkOrderBatchSummaryRow[]): string =>
  (
    batches.reduce((sum, batch) => sum + scaledQuantity(batch.completed_quantity), 0) / 10_000
  ).toFixed(4);

const workOrderBatchDetails = (
  plannedQuantity: string,
  completedQuantity: string,
  unfinishedBatches: WorkOrderBatchSummaryRow[],
): Record<string, unknown> => ({
  plannedQuantity,
  completedQuantity,
  unfinishedBatches: unfinishedBatches.map((batch) => ({
    id: String(batch.id),
    batchNo: batch.batch_no,
    status: batch.status,
    plannedQuantity: batch.planned_quantity,
    completedQuantity: batch.completed_quantity,
  })),
});
