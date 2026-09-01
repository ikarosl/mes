import { Inject, Injectable } from '@nestjs/common';
import { generateBatchNo } from '@company/code-rules';
import { DEMAND_GENERATION_GROUP_TYPE, DEMAND_TYPE } from '@company/constants';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateProductionBatchPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchCancellationCheck,
  ProductionBatchItem,
  ProductionBatchQuery,
  UpdateBatchStepExecutionPayload,
  UpdateProductionBatchPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toDateOnlyString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type { ProcessRouteSnapshot, ProductBomSnapshot } from '../../product/public.js';
import type { ResolvedBatchStepOverride } from '../application/ports/production.repository.js';
import { requireBatchTransition } from '../domain/production-status.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { buildDemandGenerationKeys } from '../domain/production-demand-generation-group.js';
import {
  BATCH_SELECT,
  batchAudit,
  type BatchRow,
  type Db,
  ensureNoDuplicate,
  findBatch,
  findStepRecord,
  findWorkOrder,
  mapBatch,
  mapStep,
  multiply,
  STEP_RECORD_SELECT,
  stepAudit,
  type StepRow,
} from './mysql-production.shared.js';

import {
  buildBatchCancellationCheck,
  loadBatchCancellationState,
} from './mysql-production-batch-cancellation.js';

@Injectable()
export class MysqlProductionBatchRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async list(query: ProductionBatchQuery): Promise<PageResult<ProductionBatchItem>> {
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
      `${BATCH_SELECT} WHERE ${where} ORDER BY b.created_at DESC,b.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(mapBatch), total: Number(count?.total ?? 0), page, pageSize };
  }

  async get(id: string): Promise<ProductionBatchDetail> {
    return this.getDetail(this.pool, id);
  }

  async getCancellationCheck(id: string): Promise<ProductionBatchCancellationCheck> {
    const batch = await findBatch(this.pool, id);
    const state = await loadBatchCancellationState(this.pool, id, false);
    return buildBatchCancellationCheck(id, batch, state);
  }

  async listForWorkOrder(workOrderId: string): Promise<ProductionBatchItem[]> {
    await findWorkOrder(this.pool, workOrderId);
    return this.listForWorkOrderIn(this.pool, workOrderId);
  }

  async getProductId(id: string): Promise<string> {
    const [[row]] = await this.pool.query<(RowDataPacket & { product_id: number })[]>(
      'SELECT product_id FROM production_batches WHERE id=?',
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
    return String(row.product_id);
  }

  async withBatchCreationTransaction<T>(
    workOrderId: string,
    action: (workOrderProductId: string) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (connection) => {
      const order = await findWorkOrder(connection, workOrderId, true);
      if (order.status !== 'released' && order.status !== 'doing')
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有已下达或生产中的工单可以创建生产批次',
        );
      return action(String(order.product_id));
    });
  }

  async create(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    route: ProcessRouteSnapshot | null,
    stepOverrides: ResolvedBatchStepOverride[],
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const order = await findWorkOrder(connection, workOrderId, true);
      if (order.status !== 'released' && order.status !== 'doing')
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有已下达或生产中的工单可以创建生产批次',
        );
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
        integerQuantity(assigned?.quantity ?? 0) + integerQuantity(payload.plannedQuantity) >
        integerQuantity(order.planned_quantity)
      )
        throw new ProductionDomainError('INVALID_INPUT', '生产批次计划数量超过工单剩余数量');
      this.assertPlanWithinWorkOrder(
        payload.planStartDate ?? null,
        payload.planEndDate ?? null,
        order,
      );
      if (route && route.product.id !== String(order.product_id))
        throw new ProductionDomainError('INVALID_INPUT', '工艺路线不属于工单产品');
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO production_batches (work_order_id,product_id,batch_no,route_id,route_code_snapshot,route_version_snapshot,planned_quantity,plan_start_date,plan_end_date,batch_owner_id,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
          audit.actorId,
          audit.actorId,
        ],
      );
      const overrides = new Map(stepOverrides.map((override) => [override.routeStepId, override]));
      for (const step of route?.steps ?? []) {
        const override = overrides.get(step.routeStepId);
        await connection.execute(
          `INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,sop_file_id_snapshot,sop_file_name_snapshot,sop_object_key_snapshot,sop_version_no_snapshot,default_responsible_user_id_snapshot,responsible_user_id,actual_sop_file_id,actual_sop_file_name_snapshot,actual_sop_object_key_snapshot,actual_sop_version_no_snapshot,need_record_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
            null,
            override?.actualSop?.id ?? null,
            override?.actualSop?.fileName ?? null,
            override?.actualSop?.objectKey ?? null,
            override?.actualSop?.versionNo ?? null,
            Number(step.needRecord),
            Number(step.needInspection),
            order.unit_snapshot,
            audit.actorId,
            audit.actorId,
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
      return this.getDetail(connection, String(result.insertId));
    }).catch((error) => ensureNoDuplicate(error, '单据编号或幂等键已存在'));
  }

  async update(
    id: string,
    payload: UpdateProductionBatchPayload,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const unlocked = await findBatch(connection, id);
      const order = await findWorkOrder(connection, String(unlocked.work_order_id), true);
      const before = await findBatch(connection, id, true);
      if (before.status !== 'pending')
        throw new ProductionDomainError('INVALID_STATE', '仅待处理生产批次可编辑');
      const planStartDate =
        payload.planStartDate === undefined
          ? toDateOnlyString(before.plan_start_date)
          : payload.planStartDate;
      const planEndDate =
        payload.planEndDate === undefined
          ? toDateOnlyString(before.plan_end_date)
          : payload.planEndDate;
      if (planStartDate && planEndDate && planEndDate < planStartDate)
        throw new ProductionDomainError('INVALID_INPUT', '计划完工日期不能早于计划开始日期');
      this.assertPlanWithinWorkOrder(planStartDate, planEndDate, order);
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE production_batches SET batch_owner_id=?,plan_start_date=?,plan_end_date=?,remark=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [
          payload.ownerId === undefined ? before.owner_id : payload.ownerId,
          planStartDate,
          planEndDate,
          payload.remark === undefined ? before.remark : payload.remark,
          audit.actorId,
          id,
          payload.version,
        ],
      );
      this.assertVersion(result, '生产批次已被其他操作修改，请刷新后重试');
      await this.audit(
        connection,
        audit,
        'production-batch.update',
        id,
        batchAudit(before),
        payload,
      );
      return this.getDetail(connection, id);
    });
  }

  private assertPlanWithinWorkOrder(
    planStartDate: string | null,
    planEndDate: string | null,
    order: {
      plan_start_date: Date | string | null;
      plan_end_date: Date | string | null;
    },
  ): void {
    const orderStartDate = toDateOnlyString(order.plan_start_date);
    const orderEndDate = toDateOnlyString(order.plan_end_date);
    if (planStartDate && orderStartDate && planStartDate < orderStartDate)
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '生产任务计划开始日期不能早于工单计划开始日期',
      );
    if (planEndDate && orderEndDate && planEndDate > orderEndDate)
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '生产任务计划结束日期不能晚于工单计划结束日期',
      );
  }

  async cancel(
    id: string,
    version: number,
    reason: string,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const before = await findBatch(connection, id, true);
      if (before.status === 'cancelled') return this.getDetail(connection, id);
      requireBatchTransition(before.status, 'cancelled');
      if (before.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产任务已被其他操作修改，请刷新后重试',
        );

      const cancellationState = await loadBatchCancellationState(connection, id, true);
      const confirmedOutbounds = cancellationState.outbounds.filter(
        (outbound) => outbound.status !== 'pending_picking',
      );
      if (confirmedOutbounds.length > 0)
        throw new ProductionDomainError(
          'BATCH_CANCEL_NOT_ALLOWED',
          '生产任务已有物料出库事实，不能取消',
          {
            outbounds: confirmedOutbounds.map((outbound) => ({
              id: String(outbound.id),
              outboundNo: outbound.outbound_no,
              status: outbound.status,
            })),
          },
        );

      const pendingOutboundIds = cancellationState.outbounds.map((outbound) => String(outbound.id));
      await connection.execute(
        `UPDATE outbound_order
         SET status='cancelled',cancel_source='production_batch',cancel_reason=?,cancelled_by=?,
             cancelled_at=NOW(),version=version+1,updated_by=?
         WHERE production_batch_id=? AND status='pending_picking'`,
        [reason, audit.actorId, audit.actorId, id],
      );
      await connection.execute(
        `UPDATE production_item_allocation
         SET allocation_status='cancelled',version=version+1,updated_by=?
         WHERE production_batch_id=? AND allocation_status='active'`,
        [audit.actorId, id],
      );
      await connection.execute(
        `UPDATE production_item_demand
         SET business_status='cancelled',cancel_source='production_batch',cancel_reason=?,
             cancelled_by=?,cancelled_at=NOW(),
             version=version+1,updated_by=?
         WHERE production_batch_id=? AND business_status='active'`,
        [reason, audit.actorId, audit.actorId, id],
      );
      await connection.execute(
        `UPDATE production_short_batch_authorization
         SET status='superseded',version=version+1
         WHERE production_batch_id=? AND status='active'`,
        [id],
      );
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE production_batches
         SET status='cancelled',material_plan_version=material_plan_version+1,
             cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=?
         WHERE id=? AND status IN ('pending','material_pending','material_assigned') AND version=?`,
        [reason, audit.actorId, audit.actorId, id, version],
      );
      this.assertVersion(updated, '生产任务已被其他操作修改，请刷新后重试');
      await this.audit(connection, audit, 'production-batch.cancel', id, batchAudit(before), {
        status: 'cancelled',
        reason,
        cancelledPendingOutboundIds: pendingOutboundIds,
        cancelledAllocationCount: cancellationState.allocationIds.length,
        cancelledDemandCount: cancellationState.demandIds.length,
        version: version + 1,
      });
      return this.getDetail(connection, id);
    });
  }

  async updateStepExecution(
    batchId: string,
    recordId: string,
    payload: UpdateBatchStepExecutionPayload,
    actualSop:
      { id: string; fileName: string; objectKey: string; versionNo: string } | null | undefined,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      if (batch.status === 'cancelled' || batch.status === 'completed')
        throw new ProductionDomainError('INVALID_STATE', '已取消或已完成批次不能调整工序执行参数');
      const before = await findStepRecord(connection, batchId, recordId, true);
      if (before.status !== 'pending' && before.status !== 'assigned')
        throw new ProductionDomainError('INVALID_STATE', '工序开始后不能调整实际 SOP');
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE batch_step_records SET actual_sop_file_id=?,actual_sop_file_name_snapshot=?,actual_sop_object_key_snapshot=?,actual_sop_version_no_snapshot=?,version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND version=?`,
        [
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
          audit.actorId,
          recordId,
          batchId,
          payload.version,
        ],
      );
      this.assertVersion(result, '工序执行参数已被其他操作修改，请刷新后重试');
      await this.audit(
        connection,
        audit,
        'production-batch-step.execution.update',
        recordId,
        stepAudit(before),
        payload,
      );
      return this.getDetail(connection, batchId);
    });
  }

  async generateMaterialDemands(
    batchId: string,
    version: number,
    bom: ProductBomSnapshot,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      if (batch.status === 'material_pending') return this.getDetail(connection, batchId);
      requireBatchTransition(batch.status, 'material_pending');
      if (String(batch.product_id) !== bom.product.id)
        throw new ProductionDomainError('INVALID_INPUT', 'BOM 与生产批次产品不一致');
      for (const line of bom.lines) {
        const generationKeys = buildDemandGenerationKeys(
          {
            type: DEMAND_GENERATION_GROUP_TYPE.normal,
            productionBatchId: batchId,
          },
          line.productMaterialId,
        );
        await connection.execute(
          `INSERT INTO production_item_demand (production_batch_id,product_material_id,item_id,item_code_snapshot,item_name_snapshot,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,idempotency_key,business_status,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,CAST(? AS SIGNED),?,?,?,'active',?,?)`,
          [
            batchId,
            line.productMaterialId,
            line.materialProductId,
            line.itemCode,
            line.productName,
            line.quantityPerUnit,
            line.unit,
            Number(line.isKeyMaterial),
            Number(line.needBatchRecord),
            batch.planned_quantity,
            multiply(line.quantityPerUnit, batch.planned_quantity),
            multiply(line.quantityPerUnit, batch.planned_quantity),
            DEMAND_TYPE.normal,
            generationKeys.generationGroupKey,
            generationKeys.idempotencyKey,
            audit.actorId,
            audit.actorId,
          ],
        );
      }
      const [result] = await connection.execute<ResultSetHeader>(
        "UPDATE production_batches SET status='material_pending',material_plan_version=material_plan_version+1,version=version+1,updated_by=? WHERE id=? AND version=?",
        [audit.actorId, batchId, version],
      );
      this.assertVersion(result, '生产批次已被其他操作修改，请刷新后重试');
      await this.audit(
        connection,
        audit,
        'production-batch.generate-material-demands',
        batchId,
        { status: batch.status, version: batch.version },
        { status: 'material_pending', demandCount: bom.lines.length },
      );
      return this.getDetail(connection, batchId);
    });
  }

  private async listForWorkOrderIn(db: Db, workOrderId: string): Promise<ProductionBatchItem[]> {
    const [rows] = await db.query<BatchRow[]>(
      `${BATCH_SELECT} WHERE b.work_order_id=? ORDER BY b.created_at DESC,b.id DESC`,
      [workOrderId],
    );
    return rows.map(mapBatch);
  }
  private async getDetail(db: Db, id: string): Promise<ProductionBatchDetail> {
    const batch = await findBatch(db, id);
    const [steps] = await db.query<StepRow[]>(
      `${STEP_RECORD_SELECT} WHERE sr.production_batch_id=? ORDER BY sr.step_order_snapshot,sr.id`,
      [id],
    );
    return { ...mapBatch(batch), stepRecords: steps.map(mapStep) };
  }
  private async nextBatchNo(connection: PoolConnection): Promise<string> {
    const [rows] = await connection.query<(RowDataPacket & { batch_no: string })[]>(
      "SELECT batch_no FROM production_batches WHERE batch_no LIKE 'task_batch-%' FOR UPDATE",
    );
    const next =
      rows.reduce((highest, row) => {
        const suffix = Number(row.batch_no.slice('task_batch-'.length));
        return Number.isSafeInteger(suffix) && suffix > highest ? suffix : highest;
      }, 0) + 1;
    return generateBatchNo({ prefix: 'task_batch', sequence: next, padding: 3 });
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
      targetType: action.includes('batch-step') ? 'batch_step_record' : 'production_batch',
      result: 'success',
      beforeData,
      afterData,
      requestId: audit.requestId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    });
  }
}
