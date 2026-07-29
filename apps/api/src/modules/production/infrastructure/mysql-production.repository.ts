import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import { generateBatchNo } from '@company/code-rules';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateProductionBatchPayload,
  CreateWorkOrderPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchItem,
  ProductionBatchQuery,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderQuery,
  WorkOrderStatus,
  UpdateBatchStepExecutionPayload,
} from '@company/contracts';
import type { AuditContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type {
  ProcessRouteSnapshot,
  ProductBomSnapshot,
  ProductionProductSnapshot,
} from '../../product/public.js';
import {
  requireBatchTransition,
  requireWorkOrderTransition,
} from '../domain/production-status.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import {
  ProductionRepository,
  type ResolvedBatchStepOverride,
} from '../application/ports/production.repository.js';

type Db = Pool | PoolConnection;
type WorkOrderRow = RowDataPacket & {
  id: number;
  work_order_no: string;
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  unit_snapshot: string;
  planned_quantity: string;
  assigned_quantity: string;
  status: WorkOrderStatus;
  released_at: Date | null;
  customer_name: string | null;
  quality_level: string | null;
  work_order_owner_id: number | null;
  plan_start_date: string | null;
  plan_end_date: string | null;
  external_order_no: string | null;
  remark: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};
type BatchRow = RowDataPacket & {
  id: number;
  work_order_id: number;
  work_order_no: string;
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  batch_no: string;
  route_id: number | null;
  route_code_snapshot: string | null;
  route_version_snapshot: string | null;
  planned_quantity: string;
  completed_quantity: string;
  qualified_quantity: string;
  plan_start_date: string | null;
  plan_end_date: string | null;
  status: ProductionBatchItem['status'];
  owner_id: number | null;
  owner_name: string | null;
  completed_at: Date | null;
  started_at: Date | null;
  completed_by: number | null;
  remark: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};
type StepRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  route_step_id: number;
  step_order_snapshot: number;
  step_code_snapshot: string;
  step_name_snapshot: string;
  sop_file_id_snapshot: number | null;
  sop_file_name_snapshot: string | null;
  sop_version_no_snapshot: string | null;
  default_responsible_user_id_snapshot: number | null;
  default_responsible_user_name: string | null;
  actual_sop_file_id: number | null;
  actual_sop_file_name_snapshot: string | null;
  actual_sop_object_key_snapshot: string | null;
  actual_sop_version_no_snapshot: string | null;
  responsible_user_id: number | null;
  responsible_user_name: string | null;
  need_record_snapshot: number;
  need_inspection_snapshot: number;
  status: 'pending' | 'assigned' | 'doing' | 'completed' | 'abnormal';
  started_at: Date | null;
  completed_at: Date | null;
  output_quantity: string;
  qualified_quantity: string;
  abnormal_quantity: string;
  rework_quantity: string;
  unit_snapshot: string;
  remark: string | null;
  version: number;
};

@Injectable()
export class MysqlProductionRepository extends ProductionRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listWorkOrders(query: WorkOrderQuery): Promise<PageResult<WorkOrderItem>> {
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
      `${this.workOrderSelect()} WHERE ${where} ORDER BY wo.created_at DESC,wo.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(mapWorkOrder), total: Number(count?.total ?? 0), page, pageSize };
  }

  async getWorkOrder(id: string): Promise<WorkOrderDetail> {
    const row = await this.workOrder(this.pool, id);
    return { ...mapWorkOrder(row), batches: await this.listWorkOrderBatches(id) };
  }

  async createWorkOrder(
    payload: CreateWorkOrderPayload,
    product: ProductionProductSnapshot,
    audit: AuditContext,
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
          audit.userId,
          audit.userId,
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
      return this.getWorkOrderIn(connection, String(result.insertId));
    });
  }

  async updateWorkOrder(
    id: string,
    payload: import('@company/contracts').UpdateWorkOrderPayload,
    audit: AuditContext,
  ): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await this.workOrder(connection, id);
      if (before.status !== 'draft')
        throw new ProductionDomainError('INVALID_STATE', '只有草稿工单可以编辑');
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE work_orders SET customer_name=?,quality_level=?,work_order_owner_id=?,plan_start_date=?,plan_end_date=?,external_order_no=?,remark=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [
          payload.customerName ?? before.customer_name,
          payload.qualityLevel ?? before.quality_level,
          payload.workOrderOwnerId ?? before.work_order_owner_id,
          payload.planStartDate ?? before.plan_start_date,
          payload.planEndDate ?? before.plan_end_date,
          payload.externalOrderNo ?? before.external_order_no,
          payload.remark ?? before.remark,
          audit.userId,
          id,
          payload.version,
        ],
      );
      if (result.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '工单已被其他操作修改，请刷新后重试',
        );
      await this.audit(connection, audit, 'work-order.update', id, workOrderAudit(before), payload);
      return this.getWorkOrderIn(connection, id);
    });
  }

  async transitionWorkOrder(
    id: string,
    action: 'release' | 'cancel' | 'close',
    version: number,
    audit: AuditContext,
  ): Promise<WorkOrderDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await this.workOrder(connection, id);
      const next: WorkOrderStatus =
        action === 'release' ? 'released' : action === 'cancel' ? 'cancelled' : 'closed';
      requireWorkOrderTransition(before.status, next);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE work_orders SET status=?,released_at=CASE WHEN ?='released' THEN NOW() ELSE released_at END,version=version+1,updated_by=? WHERE id=? AND version=?`,
        [next, next, audit.userId, id, version],
      );
      if (result.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '工单已被其他操作修改，请刷新后重试',
        );
      await this.audit(
        connection,
        audit,
        `work-order.${action}`,
        id,
        { status: before.status, version: before.version },
        { status: next },
      );
      return this.getWorkOrderIn(connection, id);
    });
  }

  async listBatches(query: ProductionBatchQuery): Promise<PageResult<ProductionBatchItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['1=1'];
    const values: Array<string | number> = [];
    if (query.keyword) {
      conditions.push(
        '(b.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
      );
      values.push(
        `%${query.keyword}%`,
        `%${query.keyword}%`,
        `%${query.keyword}%`,
        `%${query.keyword}%`,
      );
    }
    if (query.workOrderId) {
      conditions.push('b.work_order_id=?');
      values.push(query.workOrderId);
    }
    if (query.status) {
      conditions.push('b.status=?');
      values.push(query.status);
    }
    if (query.ownerId) {
      conditions.push('b.batch_owner_id=?');
      values.push(query.ownerId);
    }
    const where = conditions.join(' AND ');
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id WHERE ${where}`,
      values,
    );
    const [rows] = await this.pool.query<BatchRow[]>(
      `${this.batchSelect()} WHERE ${where} ORDER BY b.created_at DESC,b.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(mapBatch), total: Number(count?.total ?? 0), page, pageSize };
  }

  async getBatch(id: string): Promise<ProductionBatchDetail> {
    return this.getBatchIn(this.pool, id);
  }
  async listWorkOrderBatches(workOrderId: string): Promise<ProductionBatchItem[]> {
    await this.workOrder(this.pool, workOrderId);
    const [rows] = await this.pool.query<BatchRow[]>(
      `${this.batchSelect()} WHERE b.work_order_id=? ORDER BY b.created_at DESC,b.id DESC`,
      [workOrderId],
    );
    return rows.map(mapBatch);
  }

  async getDefaultRouteId(workOrderId: string): Promise<string | null> {
    const [[row]] = await this.pool.query<(RowDataPacket & { default_route_id: number | null })[]>(
      'SELECT p.default_route_id FROM work_orders wo JOIN products p ON p.id=wo.product_id WHERE wo.id=?',
      [workOrderId],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产工单不存在');
    return row.default_route_id === null ? null : String(row.default_route_id);
  }
  async getBatchProductId(batchId: string): Promise<string> {
    const [[row]] = await this.pool.query<(RowDataPacket & { product_id: number })[]>(
      'SELECT product_id FROM production_batches WHERE id=?',
      [batchId],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
    return String(row.product_id);
  }

  async createBatch(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    route: ProcessRouteSnapshot | null,
    stepOverrides: ResolvedBatchStepOverride[],
    audit: AuditContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const order = await this.workOrder(connection, workOrderId, true);
      if (order.status !== 'released')
        throw new ProductionDomainError('INVALID_STATE', '只有已下达工单可以创建生产批次');
      const batchNo = payload.batchNo ?? (await this.nextBatchNo(connection));
      const [[duplicate]] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM production_batches WHERE work_order_id=? AND batch_no=? FOR UPDATE',
        [workOrderId, batchNo],
      );
      if (duplicate) throw new ProductionDomainError('CONFLICT', '同一工单下的生产批次号已存在');
      const [[assigned]] = await connection.query<(RowDataPacket & { quantity: string })[]>(
        "SELECT COALESCE(SUM(planned_quantity),0) quantity FROM production_batches WHERE work_order_id=? AND status<>'cancelled' FOR UPDATE",
        [workOrderId],
      );
      if (
        Number(assigned?.quantity ?? 0) + payload.plannedQuantity >
        Number(order.planned_quantity)
      )
        throw new ProductionDomainError('INVALID_INPUT', '生产批次计划数量超过工单剩余数量');
      if (route && route.product.id !== String(order.product_id))
        throw new ProductionDomainError('INVALID_INPUT', '工艺路线不属于工单产品');
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO production_batches (work_order_id,product_id,batch_no,route_id,route_code_snapshot,route_version_snapshot,planned_quantity,plan_start_date,plan_end_date,batch_owner_id,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          workOrderId,
          order.product_id,
          batchNo,
          route?.id ?? null,
          route?.routeCode ?? null,
          route?.versionNo ?? null,
          payload.plannedQuantity,
          payload.planStartDate ?? null,
          payload.planEndDate ?? null,
          payload.ownerId ?? null,
          payload.remark ?? null,
          audit.userId,
          audit.userId,
        ],
      );
      const overridesByRouteStepId = new Map(
        stepOverrides.map((override) => [override.routeStepId, override]),
      );
      for (const step of route?.steps ?? []) {
        const override = overridesByRouteStepId.get(step.routeStepId);
        await connection.execute(
          `INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,sop_file_id_snapshot,sop_file_name_snapshot,sop_object_key_snapshot,sop_version_no_snapshot,default_responsible_user_id_snapshot,responsible_user_id,actual_sop_file_id,actual_sop_file_name_snapshot,actual_sop_object_key_snapshot,actual_sop_version_no_snapshot,need_record_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            result.insertId,
            step.routeStepId,
            step.stepOrder,
            step.stepCode,
            step.stepName,
            step.sop?.id ?? null,
            step.sop?.fileName ?? null,
            step.sop?.objectKey ?? null,
            step.sop?.versionNo ?? null,
            step.defaultOwnerId ?? null,
            override?.responsibleUserId ?? null,
            override?.actualSop?.id ?? null,
            override?.actualSop?.fileName ?? null,
            override?.actualSop?.objectKey ?? null,
            override?.actualSop?.versionNo ?? null,
            Number(step.needRecord),
            Number(step.needInspection),
            order.unit_snapshot,
            audit.userId,
            audit.userId,
          ],
        );
      }
      await this.audit(
        connection,
        audit,
        'production-batch.create',
        String(result.insertId),
        null,
        { ...payload, routeId: route?.id ?? null, stepCount: route?.steps.length ?? 0 },
      );
      return this.getBatchIn(connection, String(result.insertId));
    });
  }

  async updateBatch(
    id: string,
    payload: import('@company/contracts').UpdateProductionBatchPayload,
    audit: AuditContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await this.batch(connection, id);
      if (before.status !== 'pending')
        throw new ProductionDomainError('INVALID_STATE', '仅待处理生产批次可编辑');
      const planStartDate =
        payload.planStartDate === undefined ? before.plan_start_date : payload.planStartDate;
      const planEndDate =
        payload.planEndDate === undefined ? before.plan_end_date : payload.planEndDate;
      if (planStartDate && planEndDate && planEndDate < planStartDate)
        throw new ProductionDomainError('INVALID_INPUT', '计划完工日期不能早于计划开始日期');
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE production_batches SET batch_owner_id=?,plan_start_date=?,plan_end_date=?,remark=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [
          payload.ownerId === undefined ? before.owner_id : payload.ownerId,
          planStartDate,
          planEndDate,
          payload.remark === undefined ? before.remark : payload.remark,
          audit.userId,
          id,
          payload.version,
        ],
      );
      if (result.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产批次已被其他操作修改，请刷新后重试',
        );
      await this.audit(
        connection,
        audit,
        'production-batch.update',
        id,
        batchAudit(before),
        payload,
      );
      return this.getBatchIn(connection, id);
    });
  }

  async updateBatchStepExecution(
    batchId: string,
    recordId: string,
    payload: UpdateBatchStepExecutionPayload,
    actualSop:
      { id: string; fileName: string; objectKey: string; versionNo: string } | null | undefined,
    audit: AuditContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await this.batch(connection, batchId, true);
      if (batch.status === 'cancelled' || batch.status === 'completed') {
        throw new ProductionDomainError('INVALID_STATE', '已取消或已完成批次不能调整工序执行参数');
      }
      const before = await this.stepRecord(connection, batchId, recordId, true);
      if (before.status !== 'pending' && before.status !== 'assigned') {
        throw new ProductionDomainError('INVALID_STATE', '工序开始后不能调整实际 SOP 或负责人');
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE batch_step_records
            SET responsible_user_id=?,actual_sop_file_id=?,actual_sop_file_name_snapshot=?,
                actual_sop_object_key_snapshot=?,actual_sop_version_no_snapshot=?,version=version+1,updated_by=?
          WHERE id=? AND production_batch_id=? AND version=?`,
        [
          payload.responsibleUserId === undefined
            ? before.responsible_user_id
            : payload.responsibleUserId,
          actualSop === undefined ? before.actual_sop_file_id : (actualSop?.id ?? null),
          actualSop === undefined
            ? before.actual_sop_file_name_snapshot
            : (actualSop?.fileName ?? null),
          actualSop === undefined
            ? before.actual_sop_object_key_snapshot
            : (actualSop?.objectKey ?? null),
          actualSop === undefined
            ? before.actual_sop_version_no_snapshot
            : (actualSop?.versionNo ?? null),
          audit.userId,
          recordId,
          batchId,
          payload.version,
        ],
      );
      if (result.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '工序执行参数已被其他操作修改，请刷新后重试',
        );
      await this.audit(
        connection,
        audit,
        'production-batch-step.execution.update',
        recordId,
        stepAudit(before),
        payload,
      );
      return this.getBatchIn(connection, batchId);
    });
  }

  async generateMaterialDemands(
    batchId: string,
    version: number,
    bom: ProductBomSnapshot,
    audit: AuditContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await this.batch(connection, batchId, true);
      if (batch.status === 'material_pending') return this.getBatchIn(connection, batchId);
      requireBatchTransition(batch.status, 'material_pending');
      if (String(batch.product_id) !== bom.product.id)
        throw new ProductionDomainError('INVALID_INPUT', 'BOM 与生产批次产品不一致');
      for (const line of bom.lines) {
        const idempotencyKey = `NORMAL:${batchId}:${line.productMaterialId}`;
        await connection.execute(
          `INSERT INTO production_item_demand (production_batch_id,product_material_id,item_id,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,demand_type,idempotency_key,business_status,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,0,?,'active',?,?)`,
          [
            batchId,
            line.productMaterialId,
            line.materialProductId,
            line.quantityPerUnit,
            line.unit,
            Number(line.isKeyMaterial),
            Number(line.needBatchRecord),
            batch.planned_quantity,
            multiply(line.quantityPerUnit, batch.planned_quantity),
            idempotencyKey,
            audit.userId,
            audit.userId,
          ],
        );
      }
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE production_batches SET status='material_pending',version=version+1,updated_by=? WHERE id=? AND version=?",
        [audit.userId, batchId, version],
      );
      if (result.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产批次已被其他操作修改，请刷新后重试',
        );
      await this.audit(
        connection,
        audit,
        'production-batch.generate-material-demands',
        batchId,
        { status: batch.status, version: batch.version },
        { status: 'material_pending', demandCount: bom.lines.length },
      );
      return this.getBatchIn(connection, batchId);
    });
  }

  private async getWorkOrderIn(db: Db, id: string): Promise<WorkOrderDetail> {
    const row = await this.workOrder(db, id);
    const [batches] = await db.query<BatchRow[]>(
      `${this.batchSelect()} WHERE b.work_order_id=? ORDER BY b.created_at DESC,b.id DESC`,
      [id],
    );
    return { ...mapWorkOrder(row), batches: batches.map(mapBatch) };
  }
  private async nextBatchNo(connection: PoolConnection): Promise<string> {
    const [rows] = await connection.query<(RowDataPacket & { batch_no: string })[]>(
      "SELECT batch_no FROM production_batches WHERE batch_no LIKE 'task_batch-%' FOR UPDATE",
    );
    const nextSequence =
      rows.reduce((highest, row) => {
        const suffix = Number(row.batch_no.slice('task_batch-'.length));
        return Number.isSafeInteger(suffix) && suffix > highest ? suffix : highest;
      }, 0) + 1;
    return generateBatchNo({ prefix: 'task_batch', sequence: nextSequence, padding: 3 });
  }
  private async getBatchIn(db: Db, id: string): Promise<ProductionBatchDetail> {
    const batch = await this.batch(db, id);
    const [steps] = await db.query<StepRow[]>(
      `${this.stepRecordSelect()} WHERE sr.production_batch_id=? ORDER BY sr.step_order_snapshot,sr.id`,
      [id],
    );
    return { ...mapBatch(batch), stepRecords: steps.map(mapStep) };
  }
  private async workOrder(db: Db, id: string, lock = false): Promise<WorkOrderRow> {
    const [rows] = await db.query<WorkOrderRow[]>(
      `${this.workOrderSelect()} WHERE wo.id=?${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产工单不存在');
    return rows[0];
  }
  private async batch(db: Db, id: string, lock = false): Promise<BatchRow> {
    const [rows] = await db.query<BatchRow[]>(
      `${this.batchSelect()} WHERE b.id=?${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
    return rows[0];
  }
  private async stepRecord(
    db: Db,
    batchId: string,
    recordId: string,
    lock = false,
  ): Promise<StepRow> {
    const [rows] = await db.query<StepRow[]>(
      `${this.stepRecordSelect()} WHERE sr.id=? AND sr.production_batch_id=?${lock ? ' FOR UPDATE' : ''}`,
      [recordId, batchId],
    );
    if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '批次工序记录不存在');
    return rows[0];
  }
  private workOrderSelect(): string {
    return `SELECT wo.id,wo.work_order_no,wo.product_id,wo.product_code_snapshot,wo.product_name_snapshot,wo.unit_snapshot,wo.planned_quantity,wo.customer_name,wo.quality_level,wo.work_order_owner_id,wo.plan_start_date,wo.plan_end_date,COALESCE((SELECT SUM(b.planned_quantity) FROM production_batches b WHERE b.work_order_id=wo.id AND b.status<>'cancelled'),0) assigned_quantity,wo.status,wo.released_at,wo.external_order_no,wo.remark,wo.version,wo.created_at,wo.updated_at FROM work_orders wo`;
  }
  private batchSelect(): string {
    return `SELECT b.id,b.work_order_id,wo.work_order_no,b.product_id,wo.product_code_snapshot,wo.product_name_snapshot,b.batch_no,b.route_id,b.route_code_snapshot,b.route_version_snapshot,b.planned_quantity,b.completed_quantity,b.qualified_quantity,b.plan_start_date,b.plan_end_date,b.started_at,b.status,b.batch_owner_id owner_id,u.display_name owner_name,b.completed_at,b.completed_by,b.remark,b.version,b.created_at,b.updated_at FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id LEFT JOIN users u ON u.id=b.batch_owner_id`;
  }
  private stepRecordSelect(): string {
    return `SELECT sr.id,sr.production_batch_id,sr.route_step_id,sr.step_order_snapshot,sr.step_code_snapshot,sr.step_name_snapshot,sr.sop_file_id_snapshot,sr.sop_file_name_snapshot,sr.sop_version_no_snapshot,sr.default_responsible_user_id_snapshot,du.display_name default_responsible_user_name,sr.actual_sop_file_id,sr.actual_sop_file_name_snapshot,sr.actual_sop_object_key_snapshot,sr.actual_sop_version_no_snapshot,sr.responsible_user_id,u.display_name responsible_user_name,sr.need_record_snapshot,sr.need_inspection_snapshot,sr.status,sr.started_at,sr.completed_at,sr.output_quantity,sr.qualified_quantity,sr.abnormal_quantity,sr.rework_quantity,sr.unit_snapshot,sr.remark,sr.version FROM batch_step_records sr LEFT JOIN users du ON du.id=sr.default_responsible_user_id_snapshot LEFT JOIN users u ON u.id=sr.responsible_user_id`;
  }
  private async audit(
    connection: PoolConnection,
    audit: AuditContext,
    action: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ): Promise<void> {
    await writeTransactionalAudit(connection, {
      logType: 'business',
      module: 'production',
      action,
      userId: audit.userId,
      targetId,
      targetType: action.startsWith('work-order')
        ? 'work_order'
        : action.includes('batch-step')
          ? 'batch_step_record'
          : 'production_batch',
      result: 'success',
      beforeData,
      afterData,
      requestId: audit.requestId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
  }
}

const mapWorkOrder = (row: WorkOrderRow): WorkOrderItem => ({
  id: String(row.id),
  workOrderNo: row.work_order_no,
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  unit: row.unit_snapshot,
  plannedQuantity: row.planned_quantity,
  customerName: row.customer_name,
  qualityLevel: row.quality_level,
  workOrderOwnerId: row.work_order_owner_id === null ? null : String(row.work_order_owner_id),
  planStartDate: row.plan_start_date,
  planEndDate: row.plan_end_date,
  assignedQuantity: row.assigned_quantity,
  status: row.status,
  releasedAt: date(row.released_at),
  externalOrderNo: row.external_order_no,
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});
const mapBatch = (row: BatchRow): ProductionBatchItem => ({
  id: String(row.id),
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  batchNo: row.batch_no,
  routeId: row.route_id === null ? null : String(row.route_id),
  routeCode: row.route_code_snapshot,
  routeVersion: row.route_version_snapshot,
  plannedQuantity: row.planned_quantity,
  completedQuantity: row.completed_quantity,
  qualifiedQuantity: row.qualified_quantity,
  planStartDate: row.plan_start_date,
  planEndDate: row.plan_end_date,
  startedAt: date(row.started_at),
  status: row.status,
  ownerId: row.owner_id === null ? null : String(row.owner_id),
  ownerName: row.owner_name,
  completedAt: date(row.completed_at),
  completedBy: row.completed_by === null ? null : String(row.completed_by),
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
  updatedAt: toBeijingISOString(row.updated_at),
});
const mapStep = (row: StepRow) => ({
  id: String(row.id),
  productionBatchId: String(row.production_batch_id),
  routeStepId: String(row.route_step_id),
  stepOrder: row.step_order_snapshot,
  stepCode: row.step_code_snapshot,
  stepName: row.step_name_snapshot,
  defaultSopFileId: row.sop_file_id_snapshot === null ? null : String(row.sop_file_id_snapshot),
  defaultSopFileName: row.sop_file_name_snapshot,
  defaultSopVersionNo: row.sop_version_no_snapshot,
  actualSopFileId: row.actual_sop_file_id === null ? null : String(row.actual_sop_file_id),
  actualSopFileName: row.actual_sop_file_name_snapshot,
  actualSopVersionNo: row.actual_sop_version_no_snapshot,
  defaultResponsibleUserId:
    row.default_responsible_user_id_snapshot === null
      ? null
      : String(row.default_responsible_user_id_snapshot),
  defaultResponsibleUserName: row.default_responsible_user_name,
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  responsibleUserName: row.responsible_user_name,
  needRecord: Boolean(row.need_record_snapshot),
  needInspection: Boolean(row.need_inspection_snapshot),
  status: row.status,
  startedAt: date(row.started_at),
  completedAt: date(row.completed_at),
  outputQuantity: row.output_quantity,
  qualifiedQuantity: row.qualified_quantity,
  abnormalQuantity: row.abnormal_quantity,
  reworkQuantity: row.rework_quantity,
  unit: row.unit_snapshot,
  remark: row.remark,
  version: row.version,
});
const date = (value: Date | null): string | null =>
  value === null ? null : toBeijingISOString(value);
const multiply = (left: string, right: string): string => (Number(left) * Number(right)).toFixed(4);
const workOrderAudit = (row: WorkOrderRow) => ({
  externalOrderNo: row.external_order_no,
  remark: row.remark,
  version: row.version,
});
const batchAudit = (row: BatchRow) => ({
  ownerId: row.owner_id === null ? null : String(row.owner_id),
  planStartDate: row.plan_start_date,
  planEndDate: row.plan_end_date,
  remark: row.remark,
  version: row.version,
});
const stepAudit = (row: StepRow) => ({
  actualSopFileId: row.actual_sop_file_id === null ? null : String(row.actual_sop_file_id),
  responsibleUserId: row.responsible_user_id === null ? null : String(row.responsible_user_id),
  version: row.version,
});
