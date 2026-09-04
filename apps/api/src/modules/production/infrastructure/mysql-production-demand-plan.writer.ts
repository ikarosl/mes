import type { ResultSetHeader } from 'mysql2/promise';
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
  requirementBasisId: string | number;
  productMaterialId: string | number;
  itemId: string | number;
  materialVariantId: string | number;
  materialVariantCode: string;
  itemCode: string;
  itemName: string;
  quantityPerUnit: string;
  unit: string;
  isKeyMaterial: boolean | number;
  needBatchRecord: boolean | number;
  plannedOutputQuantity: string;
  needNumber: string | number;
  demandType: DemandType;
  parentDemandId?: string | number | null;
  supplementId?: string | number | null;
  manualAdditionId?: string | number | null;
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
    const demandIds: string[] = [];
    for (const line of params.lines) {
      const keys = buildDemandGenerationKeys(params.source, line.identityId);
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_item_demand
         (production_batch_id,requirement_basis_id,product_material_id,item_id,material_variant_id,
          item_code_snapshot,item_name_snapshot,material_variant_code_snapshot,
          quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,
          planned_output_quantity_snapshot,need_number,remaining_number,demand_type,generation_group_key,
          idempotency_key,parent_demand_id,manual_addition_id,supplement_id,business_status,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,
        [
          params.batchId,
          line.requirementBasisId,
          line.productMaterialId,
          line.itemId,
          line.materialVariantId,
          line.itemCode,
          line.itemName,
          line.materialVariantCode,
          line.quantityPerUnit,
          line.unit,
          Number(line.isKeyMaterial),
          Number(line.needBatchRecord),
          line.plannedOutputQuantity,
          line.needNumber,
          line.needNumber,
          line.demandType,
          keys.generationGroupKey,
          keys.idempotencyKey,
          line.parentDemandId ?? null,
          line.manualAdditionId ?? null,
          line.supplementId ?? null,
          params.actorId,
          params.actorId,
        ],
      );
      demandIds.push(String(created.insertId));
    }
    await this.advanceBatchPlan(db, params);
    return demandIds;
  }

  async reopenAfterPreStartReturn(
    db: Db,
    params: {
      batchId: string | number;
      actorId: string | null;
      returnedByDemand: ReadonlyMap<string, number>;
    },
  ): Promise<void> {
    for (const [demandId, returnedQuantity] of params.returnedByDemand) {
      const [reopened] = await db.execute<ResultSetHeader>(
        `UPDATE production_item_demand
         SET remaining_number=remaining_number+?,business_status='active',
             fulfilled_by=NULL,fulfilled_at=NULL,version=version+1,updated_by=?
         WHERE id=? AND production_batch_id=?
           AND business_status IN ('active','fulfilled')
           AND remaining_number+?<=need_number`,
        [returnedQuantity, params.actorId, demandId, params.batchId, returnedQuantity],
      );
      if (reopened.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '退料对应物料需求已变化，请刷新后重试',
        );
    }
    await this.supersedeActiveAuthorization(db, params.batchId);
    await this.advanceBatchPlan(db, params);
  }

  async cancelRemainingDemands(
    db: Db,
    params: {
      batchId: string | number;
      actorId: string | null;
      reason: string;
      expectedBatchVersion: number;
    },
  ): Promise<number> {
    const [cancelled] = await db.execute<ResultSetHeader>(
      `UPDATE production_item_demand
       SET business_status='cancelled',cancel_source='short_batch_remaining_close',cancel_reason=?,
           cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=?
       WHERE production_batch_id=? AND business_status='active'`,
      [params.reason, params.actorId, params.actorId, params.batchId],
    );
    await this.supersedeActiveAuthorization(db, params.batchId);
    await this.advanceBatchPlan(db, params);
    return cancelled.affectedRows;
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
