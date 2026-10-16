import { workOrderAssignedQuantitySql } from './mysql-work-order-allocation.sql.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import { Inject, Injectable } from '@nestjs/common';
import { allocateBusinessNumber } from '../../../../infrastructure/numbering/mysql-business-number.js';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateProductionBatchPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchCancellationCheck,
  ProductionBatchItem,
  ProductionBatchQuery,
  ProductionBatchStartRecord,
  ProductionBatchStepRecords,
  ProductionStepCommandResult,
  UpdateBatchStepExecutionPayload,
  UpdateProductionBatchPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString, toDateOnlyString } from '../../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../../infrastructure/database/database.module.js';
import type { ProcessRouteSnapshot } from '../../../product/public.js';
import { InventoryProductionDocumentCommand } from '../../../inventory/public.js';
import type { ResolvedBatchStepOverride } from '../../application/ports/production.repository.js';
import { requireBatchTransition } from '../../domain/production-status.policy.js';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { integerQuantity } from '../../domain/integer-quantity.js';
import {
  selectBatchOverview,
  selectBatchStartRecord,
  selectBatchStepRecords,
} from './mysql-production-batch.read.js';
import { readProductionSnapshot } from '../shared/mysql-production-read-snapshot.js';
import { mysqlProductionDemandPlanWriter } from '../demand/mysql-production-demand-plan.writer.js';
import { mapBatches } from './mysql-production-batch-display.mapper.js';
import {
  BATCH_SUMMARY_SELECT,
  batchAudit,
  type BatchSummaryRow,
  findBatch,
} from './mysql-production-batch.persistence.js';
import { ensureNoDuplicate } from '../shared/mysql-production-db.js';
import { findStepRecord, stepAudit } from '../execution/mysql-production-step.persistence.js';
import { findWorkOrder } from './mysql-work-order.persistence.js';

import {
  buildBatchCancellationCheck,
  loadBatchCancellationState,
} from './mysql-production-batch-cancellation.js';

@Injectable()
export class MysqlProductionBatchRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly documents: InventoryProductionDocumentCommand,
  ) {}

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
    const [rows] = await this.pool.query<BatchSummaryRow[]>(
      `${BATCH_SUMMARY_SELECT} WHERE ${where} ORDER BY b.created_at DESC,b.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items: mapBatches(rows),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async get(id: string): Promise<ProductionBatchDetail> {
    return selectBatchOverview(this.pool, id);
  }

  getStepRecords(id: string): Promise<ProductionBatchStepRecords> {
    return readProductionSnapshot(this.pool, (db) => selectBatchStepRecords(db, id));
  }

  getStartRecord(id: string): Promise<ProductionBatchStartRecord | null> {
    return selectBatchStartRecord(this.pool, id);
  }

  async getCancellationCheck(id: string): Promise<ProductionBatchCancellationCheck> {
    const batch = await findBatch(this.pool, id);
    const state = await loadBatchCancellationState(this.pool, id, false, this.documents);
    return buildBatchCancellationCheck(id, batch, state);
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
    action: (workOrderProductId: string, orderType: ProductionBatchItem['orderType']) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (connection) => {
      const order = await findWorkOrder(connection, workOrderId, true);
      if (order.status !== 'released' && order.status !== 'doing')
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有已下达或生产中的工单可以创建生产批次',
        );
      return action(String(order.product_id), order.order_type);
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
      const batchNo = await allocateBusinessNumber(connection, 'production_batch');
      const [[assigned]] = await connection.query<(RowDataPacket & { quantity: string })[]>(
        `SELECT ${workOrderAssignedQuantitySql('?', true)} quantity`,
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
          `INSERT INTO batch_step_records (production_batch_id,route_step_id,step_order_snapshot,step_code_snapshot,step_name_snapshot,sop_file_id_snapshot,sop_file_name_snapshot,sop_object_key_snapshot,sop_version_no_snapshot,default_responsible_user_id_snapshot,responsible_user_id,actual_sop_file_id,actual_sop_file_name_snapshot,actual_sop_object_key_snapshot,actual_sop_version_no_snapshot,need_inspection_snapshot,unit_snapshot,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        { ...payload, batchNo, routeId: route?.id ?? null, stepCount: route?.steps.length ?? 0 },
      );
      return selectBatchOverview(connection, String(result.insertId));
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
      return selectBatchOverview(connection, id);
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
      await lockWorkOrderForBatch(connection, id);
      const before = await findBatch(connection, id, true);
      if (before.status === 'cancelled') return selectBatchOverview(connection, id);
      requireBatchTransition(before.status, 'cancelled');
      if (before.version !== version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产任务已被其他操作修改，请刷新后重试',
        );

      const cancellationState = await loadBatchCancellationState(
        connection,
        id,
        true,
        this.documents,
      );
      const confirmedOutbounds = cancellationState.outbounds.filter(
        (outbound) => outbound.status !== 'pending_picking',
      );
      if (confirmedOutbounds.length > 0)
        throw new ProductionDomainError(
          'BATCH_CANCEL_NOT_ALLOWED',
          '该任务已有领料出库记录，不能取消',
          {
            outbounds: confirmedOutbounds.map((outbound) => ({
              id: String(outbound.id),
              outboundNo: outbound.outbound_no,
              status: outbound.status,
            })),
          },
        );

      const pendingOutboundIds = cancellationState.outbounds.map((outbound) => String(outbound.id));
      for (const outbound of cancellationState.outbounds)
        await this.documents.cancelOutbound(
          outbound.id,
          outbound.version,
          reason,
          'production_batch',
          audit,
        );
      await connection.execute(
        `UPDATE production_item_allocation
         SET allocation_status='cancelled',version=version+1,updated_by=?
         WHERE production_batch_id=? AND allocation_status='active'`,
        [audit.actorId, id],
      );
      await mysqlProductionDemandPlanWriter.cancelBatchDemands(connection, {
        batchId: id,
        actorId: audit.actorId,
        reason,
        expectedBatchVersion: version,
      });
      await this.audit(connection, audit, 'production-batch.cancel', id, batchAudit(before), {
        status: 'cancelled',
        reason,
        cancelledPendingOutboundIds: pendingOutboundIds,
        cancelledAllocationCount: cancellationState.allocationIds.length,
        cancelledDemandCount: cancellationState.demandIds.length,
        version: version + 1,
      });
      return selectBatchOverview(connection, id);
    });
  }

  async updateStepExecution(
    batchId: string,
    recordId: string,
    payload: UpdateBatchStepExecutionPayload,
    actualSop:
      { id: string; fileName: string; objectKey: string; versionNo: string } | null | undefined,
    audit: CommandContext,
  ): Promise<ProductionStepCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const batch = await findBatch(connection, batchId, true);
      if (
        batch.status === 'cancelled' ||
        batch.status === 'completed' ||
        batch.status === 'terminated' ||
        batch.status === 'closing'
      )
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
      return {
        productionBatchId: batchId,
        batchStatus: batch.status,
        batchVersion: batch.version,
        stepRecordId: recordId,
        stepStatus: before.status,
        responsibleUserId:
          before.responsible_user_id === null ? null : String(before.responsible_user_id),
        startedAt: before.started_at === null ? null : toBeijingISOString(before.started_at),
        completedAt: before.completed_at === null ? null : toBeijingISOString(before.completed_at),
        version: payload.version + 1,
      };
    });
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
