import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DemandType } from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';
import {
  buildDemandGenerationKeys,
  type DemandGenerationGroupSource,
} from '../domain/production-demand-generation-group.js';
import type { Db } from './mysql-production.shared.js';

export type DemandPlanLine = {
  identityId: string | number | bigint;
  /** Frozen base-BOM formula that this exact demand consumes. */
  requirementBasisId: string | number | null;
  productMaterialId: string | number | null;
  itemId: string | number;
  materialVariantId: string | number;
  materialVariantCode: string;
  itemCode: string;
  quantityPerUnit: string | null;
  unit: string;
  plannedOutputQuantity: string | null;
  needNumber: string | number;
  supplierHint?: string | null;
  demandType: DemandType;
  parentDemandId?: string | number | null;
  supplementId?: string | number | null;
  manualAdditionId?: string | number | null;
  replacesDemandId?: string | number | null;
};

type CreateDemandGroupParams = {
  batchId: string | number;
  actorId: string | null;
  source: DemandGenerationGroupSource;
  lines: DemandPlanLine[];
  expectedBatchVersion?: number;
  transitionToMaterialPending?: boolean;
};

/**
 * 生产需求计划的事务内唯一写入口。
 *
 * `production_item_demand` 是需求事实，`material_plan_version` 是批次级并发与短批授权令牌；
 * 任何新增、重开或取消需求都必须在调用者既有事务中同步推进令牌。
 */
export class MysqlProductionDemandPlanWriter {
  async createDemandGroup(db: Db, params: CreateDemandGroupParams): Promise<string[]> {
    const demandIds = await this.insertDemandGroup(db, params);
    await this.advanceBatchPlan(db, params);
    return demandIds;
  }

  private async insertDemandGroup(db: Db, params: CreateDemandGroupParams): Promise<string[]> {
    const demandIds: string[] = [];
    for (const line of params.lines) {
      const keys = buildDemandGenerationKeys(params.source, line.identityId);
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_item_demand
         (production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,
          item_code_snapshot,material_variant_code_snapshot,
          quantity_per_unit_snapshot,unit_snapshot,planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,
          idempotency_key,parent_demand_id,manual_addition_id,supplement_id,replaces_demand_id,supplier_hint,business_status,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,
        [
          params.batchId,
          line.requirementBasisId,
          line.productMaterialId,
          line.itemId,
          line.materialVariantId,
          line.itemCode,
          line.materialVariantCode,
          line.quantityPerUnit,
          line.unit,
          line.plannedOutputQuantity,
          line.needNumber,
          line.needNumber,
          line.demandType,
          keys.generationGroupKey,
          keys.idempotencyKey,
          line.parentDemandId ?? null,
          line.manualAdditionId ?? null,
          line.supplementId ?? null,
          line.replacesDemandId ?? null,
          line.supplierHint ?? null,
          params.actorId,
          params.actorId,
        ],
      );
      demandIds.push(String(created.insertId));
    }
    return demandIds;
  }

  /** 关闭和新建属于同一需求计划变更；只推进一次批次/计划版本。 */
  async applyCorrection(
    db: Db,
    params: CreateDemandGroupParams & {
      demandId: string;
      correctionId: string;
      reason: string;
      closeCause: 'correction_replaced' | 'correction_exhausted' | 'single_close';
    },
  ): Promise<string | null> {
    const [closed] = await db.execute<ResultSetHeader>(
      `UPDATE production_item_demand SET business_status='closed',close_cause=?,close_reason=?,
       closed_by=?,closed_at=NOW(),close_correction_id=?,pending_correction_id=NULL,version=version+1,updated_by=?
       WHERE id=? AND production_batch_id=? AND business_status='active' AND pending_correction_id=?`,
      [
        params.closeCause,
        params.reason,
        params.actorId,
        params.correctionId,
        params.actorId,
        params.demandId,
        params.batchId,
        params.correctionId,
      ],
    );
    if (closed.affectedRows !== 1)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '原需求在审状态已变化');
    const ids = await this.insertDemandGroup(db, params);
    await this.supersedeActiveAuthorization(db, params.batchId);
    await this.advanceBatchPlan(db, params);
    return ids[0] ?? null;
  }

  async closeDemandForCloseout(
    db: Db,
    params: {
      batchId: string;
      demandId: string;
      closeoutId: string;
      actorId: string;
      reason: string;
      expectedBatchVersion: number;
    },
  ): Promise<void> {
    const [closed] = await db.execute<ResultSetHeader>(
      `UPDATE production_item_demand SET business_status='closed',close_cause='batch_closeout',close_reason=?,
       closed_by=?,closed_at=NOW(),closeout_id=?,version=version+1,updated_by=?
       WHERE id=? AND production_batch_id=? AND business_status='active' AND pending_correction_id IS NULL`,
      [
        params.reason,
        params.actorId,
        params.closeoutId,
        params.actorId,
        params.demandId,
        params.batchId,
      ],
    );
    if (closed.affectedRows !== 1)
      throw new ProductionDomainError('INVALID_STATE', '需求不存在、已结束或正在审批');
    await this.supersedeActiveAuthorization(db, params.batchId);
    await this.advanceBatchPlan(db, params);
  }

  async cancelRemainingDemands(
    _db: Db,
    _params: {
      batchId: string | number;
      actorId: string | null;
      reason: string;
      expectedBatchVersion: number;
      cancelSource?: 'short_batch_remaining_close' | 'production_termination';
    },
  ): Promise<number> {
    throw new ProductionDomainError(
      'INVALID_STATE',
      '批量取消剩余需求已停用，请逐项收尾或提交需求纠错审批',
    );
  }

  async cancelBatchDemands(
    db: Db,
    params: {
      batchId: string | number;
      actorId: string | null;
      reason: string;
      expectedBatchVersion: number;
    },
  ): Promise<number> {
    const [pending] = await db.query<RowDataPacket[]>(
      'SELECT id FROM production_item_demand WHERE production_batch_id=? AND pending_correction_id IS NOT NULL FOR UPDATE',
      [params.batchId],
    );
    if (pending.length)
      throw new ProductionDomainError('INVALID_STATE', '先撤回或驳回在途需求更正，再取消任务');
    const [cancelled] = await db.execute<ResultSetHeader>(
      `UPDATE production_item_demand
       SET business_status='cancelled',cancel_source='production_batch',cancel_reason=?,
           cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=?
       WHERE production_batch_id=? AND business_status='active'`,
      [params.reason, params.actorId, params.actorId, params.batchId],
    );
    await this.supersedeActiveAuthorization(db, params.batchId);
    const [updated] = await db.execute<ResultSetHeader>(
      `UPDATE production_batches
       SET status='cancelled',material_plan_version=material_plan_version+1,
           cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=?
       WHERE id=? AND status IN ('pending','material_pending','material_assigned') AND version=?`,
      [params.reason, params.actorId, params.actorId, params.batchId, params.expectedBatchVersion],
    );
    this.requireBatchUpdated(updated);
    return cancelled.affectedRows;
  }

  private async advanceBatchPlan(
    db: Db,
    params: {
      batchId: string | number;
      actorId: string | null;
      expectedBatchVersion?: number;
      transitionToMaterialPending?: boolean;
    },
  ): Promise<void> {
    const expectedVersionClause = params.expectedBatchVersion === undefined ? '' : ' AND version=?';
    const values = [params.actorId, params.batchId];
    if (params.expectedBatchVersion !== undefined) values.push(params.expectedBatchVersion);
    const [updated] = await db.execute<ResultSetHeader>(
      `UPDATE production_batches
       SET ${params.transitionToMaterialPending ? "status='material_pending'," : ''}
           material_plan_version=material_plan_version+1,version=version+1,updated_by=?
       WHERE id=?${expectedVersionClause}`,
      values,
    );
    this.requireBatchUpdated(updated);
  }

  private async supersedeActiveAuthorization(db: Db, batchId: string | number): Promise<void> {
    await db.execute(
      `UPDATE production_short_batch_authorization
       SET status='superseded',version=version+1
       WHERE production_batch_id=? AND status='active'`,
      [batchId],
    );
  }

  private requireBatchUpdated(result: ResultSetHeader): void {
    if (result.affectedRows !== 1)
      throw new ProductionDomainError(
        'CONCURRENT_MODIFICATION',
        '生产任务已被其他操作修改，请刷新后重试',
      );
  }
}

export const mysqlProductionDemandPlanWriter = new MysqlProductionDemandPlanWriter();
