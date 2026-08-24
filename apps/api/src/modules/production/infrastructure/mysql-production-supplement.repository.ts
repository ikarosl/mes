import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ApproveScrapSupplementPayload,
  ApproveScrapSupplementResult,
  BatchStepAbnormalDispositionItem,
  BatchStepAbnormalOrigin,
  ProductionMaterialSupplementDemandItem,
  ProductionScrapSupplementPlanItem,
  ProductionSupplementCandidateItem,
  SaveProductionScrapSupplementPlanPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionSupplementRepository } from '../application/ports/production-supplement.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { fixedIntegerQuantity, integerQuantity } from '../domain/integer-quantity.js';
import { findBatch } from './mysql-production.shared.js';

type SourceRow = RowDataPacket & {
  id: number;
  disposition_no: string;
  production_batch_id: number;
  batch_step_record_id: number;
  batch_step_report_id: number;
  review_status: BatchStepAbnormalDispositionItem['reviewStatus'];
  disposition_type: BatchStepAbnormalDispositionItem['dispositionType'];
  remark: string | null;
  version: number;
  created_at: Date;
  report_type: 'normal' | 'reversal';
  abnormal_quantity: string;
  abnormal_origin: BatchStepAbnormalOrigin;
  unit_snapshot: string;
  is_effective: number;
  route_step_id: number;
  step_order_snapshot: number;
};

type RouteStepRow = RowDataPacket & {
  id: number;
  route_step_id: number;
  step_order_snapshot: number;
};

type CandidateRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  product_material_id: number;
  item_id: number;
  quantity_per_unit_snapshot: string;
  unit_snapshot: string;
  is_key_material_snapshot: number;
  need_batch_record_snapshot: number;
  planned_output_quantity_snapshot: string;
  need_number: string;
};

type PlanRow = RowDataPacket & {
  id: number;
  plan_no: string;
  abnormal_disposition_id: number;
  production_batch_id: number;
  batch_step_record_id: number;
  source_report_id: number;
  material_end_step_record_id: number;
  status: 'draft' | 'confirmed';
  confirmed_supplement_id: number | null;
  remark: string | null;
  version: number;
  updated_at: Date;
};

type PlanLineRow = RowDataPacket & {
  original_demand_id: number;
  product_material_id: number;
  item_id: number;
  planned_quantity: string;
  unit_snapshot: string;
};

@Injectable()
export class MysqlProductionSupplementRepository extends ProductionSupplementRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  getPlan(dispositionId: string): Promise<ProductionScrapSupplementPlanItem | null> {
    return selectPlan(this.pool, dispositionId);
  }

  savePlan(
    dispositionId: string,
    payload: SaveProductionScrapSupplementPlanPayload,
    context: CommandContext,
  ): Promise<ProductionScrapSupplementPlanItem> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      const sourceIdentity = await selectSource(connection, dispositionId);
      const batch = await findBatch(connection, String(sourceIdentity.production_batch_id), true);
      if (batch.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '仅生产执行中的异常可以暂存报废补料方案');
      await connection.query(
        'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
        [sourceIdentity.production_batch_id],
      );
      const source = await selectSource(connection, dispositionId, true);
      if (source.review_status !== 'pending_review')
        throw new ProductionDomainError('INVALID_STATE', '仅待处置异常可以暂存报废补料方案');
      if (source.version !== payload.dispositionVersion)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '异常处置单已变化，请刷新后重试',
        );
      const routeSteps = await selectRouteSteps(connection, String(source.production_batch_id));
      requireMaterialEndStep(source, routeSteps, payload.materialEndStepRecordId);
      const ids = payload.details.map((line) => line.originalDemandId);
      if (new Set(ids).size !== ids.length)
        throw new ProductionDomainError('INVALID_INPUT', '同一原始需求只能暂存一条补料明细');
      const candidates = await selectCandidates(
        connection,
        String(source.production_batch_id),
        ids,
        true,
      );
      if (candidates.length !== ids.length)
        throw new ProductionDomainError('INVALID_INPUT', '补料物料不属于当前批次的有效正常需求');
      const byId = new Map(candidates.map((row) => [String(row.id), row]));
      const existing = await selectPlan(connection, dispositionId, true);
      let planId: number;
      if (!existing) {
        if (payload.planVersion !== null)
          throw new ProductionDomainError(
            'CONCURRENT_MODIFICATION',
            '报废补料方案已变化，请重新打开后编辑',
          );
        const [created] = await connection.execute<ResultSetHeader>(
          `INSERT INTO production_scrap_supplement_plan
           (plan_no,abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id,
            material_end_step_record_id,status,remark,created_by,updated_by)
           VALUES (?,?,?,?,?,?,'draft',?,?,?)`,
          [
            `SSP-${Date.now()}-${randomUUID().slice(0, 8)}`,
            dispositionId,
            source.production_batch_id,
            source.batch_step_record_id,
            source.batch_step_report_id,
            payload.materialEndStepRecordId,
            payload.remark ?? null,
            actorId,
            actorId,
          ],
        );
        planId = created.insertId;
      } else {
        if (existing.status !== 'draft')
          throw new ProductionDomainError('INVALID_STATE', '已确认的报废补料方案不能编辑');
        if (payload.planVersion === null || existing.version !== payload.planVersion)
          throw new ProductionDomainError(
            'CONCURRENT_MODIFICATION',
            '报废补料方案已被其他人修改，请重新打开后编辑',
          );
        const [updated] = await connection.execute<ResultSetHeader>(
          `UPDATE production_scrap_supplement_plan
           SET material_end_step_record_id=?,remark=?,version=version+1,updated_by=?
           WHERE id=? AND status='draft' AND version=?`,
          [
            payload.materialEndStepRecordId,
            payload.remark ?? null,
            actorId,
            existing.planId,
            payload.planVersion,
          ],
        );
        if (updated.affectedRows !== 1)
          throw new ProductionDomainError(
            'CONCURRENT_MODIFICATION',
            '报废补料方案已被其他人修改，请重新打开后编辑',
          );
        planId = Number(existing.planId);
        await connection.execute(
          'DELETE FROM production_scrap_supplement_plan_line WHERE plan_id=?',
          [planId],
        );
      }
      for (const line of payload.details) {
        const original = byId.get(line.originalDemandId)!;
        await connection.execute(
          `INSERT INTO production_scrap_supplement_plan_line
           (plan_id,production_batch_id,original_demand_id,product_material_id,item_id,
            planned_quantity,unit_snapshot,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            planId,
            source.production_batch_id,
            original.id,
            original.product_material_id,
            original.item_id,
            line.supplementQuantity,
            original.unit_snapshot,
            actorId,
            actorId,
          ],
        );
      }
      await writeTransactionalAudit(connection, {
        logType: 'business',
        action: 'production-abnormal.save-scrap-supplement-plan',
        module: 'production',
        userId: actorId,
        targetType: 'scrap_supplement_plan',
        targetId: String(planId),
        result: 'success',
        beforeData: existing,
        afterData: {
          dispositionId,
          materialEndStepRecordId: payload.materialEndStepRecordId,
          lineCount: payload.details.length,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return (await selectPlan(connection, dispositionId))!;
    });
  }

  async getCandidateContext(
    dispositionId: string,
    materialEndStepRecordId: string,
  ): Promise<{
    routeStepIds: string[];
    candidates: ProductionSupplementCandidateItem[];
  }> {
    const source = await selectSource(this.pool, dispositionId);
    if (source.review_status !== 'pending_review')
      throw new ProductionDomainError('INVALID_STATE', '仅待处置异常可以选择报废补料');
    const rows = await selectCandidates(this.pool, String(source.production_batch_id));
    const routeSteps = await selectRouteSteps(this.pool, String(source.production_batch_id));
    const materialEnd = requireMaterialEndStep(source, routeSteps, materialEndStepRecordId);
    return {
      routeStepIds: routeSteps
        .filter((row) => row.step_order_snapshot <= materialEnd.step_order_snapshot)
        .map((row) => String(row.route_step_id)),
      candidates: rows.map(mapCandidate),
    };
  }

  approve(
    dispositionId: string,
    payload: ApproveScrapSupplementPayload,
    context: CommandContext,
    planReference?: { planId: string; version: number },
  ): Promise<ApproveScrapSupplementResult> {
    return withTransaction(this.pool, async (connection) => {
      const actorId = requireActor(context);
      const sourceIdentity = await selectSource(connection, dispositionId);
      const batch = await findBatch(connection, String(sourceIdentity.production_batch_id), true);
      if (batch.status !== 'doing')
        throw new ProductionDomainError('INVALID_STATE', '仅生产执行中的异常可以批准报废补料');
      await connection.query(
        'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY step_order_snapshot,id FOR UPDATE',
        [sourceIdentity.production_batch_id],
      );
      const routeSteps = await selectRouteSteps(
        connection,
        String(sourceIdentity.production_batch_id),
      );
      const source = await selectSource(connection, dispositionId, true);
      if (source.review_status !== 'pending_review')
        throw new ProductionDomainError('INVALID_STATE', '仅待处置异常可以批准报废补料');
      if (source.version !== payload.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '异常处置单已变化，请刷新后重试',
        );
      if (
        source.report_type !== 'normal' ||
        !source.is_effective ||
        integerQuantity(source.abnormal_quantity) <= 0
      )
        throw new ProductionDomainError('INVALID_STATE', '来源异常报工已失效或没有异常数量');
      let effectivePayload = payload;
      if (planReference) {
        const plan = await selectPlan(connection, dispositionId, true);
        if (!plan || plan.planId !== planReference.planId)
          throw new ProductionDomainError('NOT_FOUND', '报废补料暂存方案不存在');
        if (plan.status !== 'draft')
          throw new ProductionDomainError('INVALID_STATE', '报废补料方案已经确认');
        if (plan.version !== planReference.version)
          throw new ProductionDomainError(
            'CONCURRENT_MODIFICATION',
            '报废补料方案已被其他人修改，请重新复核',
          );
        effectivePayload = {
          version: payload.version,
          materialEndStepRecordId: plan.materialEndStepRecordId,
          remark: plan.remark,
          details: plan.lines.map((line) => ({
            originalDemandId: line.originalDemandId,
            supplementQuantity: Number(line.plannedQuantity),
          })),
        };
      }
      const materialEnd = requireMaterialEndStep(
        source,
        routeSteps,
        effectivePayload.materialEndStepRecordId,
      );
      const entryStep = routeSteps[0];
      if (!entryStep) throw new ProductionDomainError('INVALID_STATE', '生产批次没有路线工序');
      const ids = effectivePayload.details.map((line) => line.originalDemandId);
      if (new Set(ids).size !== ids.length)
        throw new ProductionDomainError('INVALID_INPUT', '同一原始需求只能提交一条补料明细');
      const candidates = await selectCandidates(
        connection,
        String(source.production_batch_id),
        ids,
        true,
      );
      if (candidates.length !== ids.length)
        throw new ProductionDomainError('INVALID_INPUT', '补料物料不属于当前批次的有效正常需求');
      const byId = new Map(candidates.map((row) => [String(row.id), row]));

      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE batch_step_abnormal_dispositions
         SET review_status='approved',disposition_type='scrap',reviewed_by=?,reviewed_at=NOW(),remark=?,version=version+1,updated_by=?
         WHERE id=? AND review_status='pending_review' AND version=?`,
        [actorId, effectivePayload.remark ?? null, actorId, dispositionId, payload.version],
      );
      if (updated.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '异常处置单已变化，请刷新后重试',
        );
      const [scrap] = await connection.execute<ResultSetHeader>(
        `INSERT INTO batch_step_scrap_records
         (abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id,scrap_quantity,unit_snapshot,created_by)
         VALUES (?,?,?,?,?,?,?)`,
        [
          dispositionId,
          source.production_batch_id,
          source.batch_step_record_id,
          source.batch_step_report_id,
          source.abnormal_quantity,
          source.unit_snapshot,
          actorId,
        ],
      );
      const supplementNo = `SUP-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const [supplement] = await connection.execute<ResultSetHeader>(
        `INSERT INTO production_material_supplement
         (supplement_no,source_type,step_scrap_record_id,production_batch_id,batch_step_record_id,
          status,remark,created_by,updated_by)
         VALUES (?,'step_scrap_reproduction',?,?,?,'approved',?,?,?)`,
        [
          supplementNo,
          scrap.insertId,
          source.production_batch_id,
          source.batch_step_record_id,
          effectivePayload.remark ?? null,
          actorId,
          actorId,
        ],
      );
      const [authorization] = await connection.execute<ResultSetHeader>(
        `INSERT INTO batch_step_scrap_reproduction_authorization
         (production_batch_id,scrap_record_id,supplement_id,entry_step_record_id,quota_end_step_record_id,material_end_step_record_id,authorized_quantity,authorized_by,authorized_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())`,
        [
          source.production_batch_id,
          scrap.insertId,
          supplement.insertId,
          entryStep.id,
          source.batch_step_record_id,
          materialEnd.id,
          source.abnormal_quantity,
          actorId,
        ],
      );
      const demands: ProductionMaterialSupplementDemandItem[] = [];
      for (const line of effectivePayload.details) {
        const original = byId.get(line.originalDemandId)!;
        const [demand] = await connection.execute<ResultSetHeader>(
          `INSERT INTO production_item_demand
           (production_batch_id,product_material_id,item_id,quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number,demand_type,idempotency_key,parent_demand_id,supplement_id,business_status,created_by,updated_by)
           VALUES (?,?,?,?,?,?,?,?,?,'scrap_supplement',?,?,?,'active',?,?)`,
          [
            source.production_batch_id,
            original.product_material_id,
            original.item_id,
            original.quantity_per_unit_snapshot,
            original.unit_snapshot,
            original.is_key_material_snapshot,
            original.need_batch_record_snapshot,
            original.planned_output_quantity_snapshot,
            line.supplementQuantity,
            `SCRAPSUP:${supplement.insertId}:${original.id}`,
            original.id,
            supplement.insertId,
            actorId,
            actorId,
          ],
        );
        demands.push({
          originalDemandId: String(original.id),
          demandId: String(demand.insertId),
          productMaterialId: String(original.product_material_id),
          itemId: String(original.item_id),
          itemCode: '',
          itemName: '',
          supplementQuantity: fixed(line.supplementQuantity),
          unit: original.unit_snapshot,
        });
      }
      if (planReference) {
        const [confirmed] = await connection.execute<ResultSetHeader>(
          `UPDATE production_scrap_supplement_plan
           SET status='confirmed',confirmed_supplement_id=?,version=version+1,updated_by=?
           WHERE id=? AND status='draft' AND version=?`,
          [supplement.insertId, actorId, planReference.planId, planReference.version],
        );
        if (confirmed.affectedRows !== 1)
          throw new ProductionDomainError(
            'CONCURRENT_MODIFICATION',
            '报废补料方案已被其他人修改，请重新复核',
          );
      }
      await writeTransactionalAudit(connection, {
        logType: 'business',
        action: planReference
          ? 'production-abnormal.confirm-scrap-supplement-plan'
          : 'production-abnormal.approve-scrap-supplement',
        module: 'production',
        userId: context.actorId,
        targetType: planReference ? 'scrap_supplement_plan' : 'abnormal_disposition',
        targetId: planReference?.planId ?? dispositionId,
        result: 'success',
        beforeData: null,
        afterData: {
          scrapRecordId: String(scrap.insertId),
          supplementId: String(supplement.insertId),
          reproductionAuthorizationId: String(authorization.insertId),
          demandIds: demands.map((line) => line.demandId),
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      const [[created]] = await connection.query<(RowDataPacket & { created_at: Date })[]>(
        'SELECT created_at FROM production_material_supplement WHERE id=?',
        [supplement.insertId],
      );
      const [[authorized]] = await connection.query<(RowDataPacket & { authorized_at: Date })[]>(
        'SELECT authorized_at FROM batch_step_scrap_reproduction_authorization WHERE id=?',
        [authorization.insertId],
      );
      return {
        disposition: mapDisposition(await selectSource(connection, dispositionId)),
        scrapRecord: {
          scrapRecordId: String(scrap.insertId),
          sourceReportId: String(source.batch_step_report_id),
          scrapQuantity: source.abnormal_quantity,
          unit: source.unit_snapshot,
        },
        reproductionAuthorization: {
          authorizationId: String(authorization.insertId),
          scrapRecordId: String(scrap.insertId),
          supplementId: String(supplement.insertId),
          entryStepRecordId: String(entryStep.id),
          quotaEndStepRecordId: String(source.batch_step_record_id),
          materialEndStepRecordId: String(materialEnd.id),
          authorizedQuantity: source.abnormal_quantity,
          authorizedBy: actorId,
          authorizedAt: toBeijingISOString(authorized!.authorized_at),
        },
        supplement: {
          supplementId: String(supplement.insertId),
          supplementNo,
          scrapRecordId: String(scrap.insertId),
          productionBatchId: String(source.production_batch_id),
          stepRecordId: String(source.batch_step_record_id),
          status: 'approved',
          remark: effectivePayload.remark ?? null,
          createdAt: toBeijingISOString(created!.created_at),
          demands,
        },
      };
    });
  }
}

const selectSource = async (
  connection: Pool | PoolConnection,
  dispositionId: string,
  lock = false,
): Promise<SourceRow> => {
  const [rows] = await connection.query<SourceRow[]>(
    `SELECT d.id,d.disposition_no,d.production_batch_id,d.batch_step_record_id,d.batch_step_report_id,
      d.review_status,d.disposition_type,d.remark,d.version,d.created_at,r.report_type,r.abnormal_quantity,
      r.abnormal_origin,r.unit_snapshot,s.route_step_id,s.step_order_snapshot,
      NOT EXISTS(SELECT 1 FROM batch_step_reports rv WHERE rv.reversal_of_report_id=r.id) is_effective
     FROM batch_step_abnormal_dispositions d JOIN batch_step_reports r ON r.id=d.batch_step_report_id
     JOIN batch_step_records s ON s.id=d.batch_step_record_id
     WHERE d.id=?${lock ? ' FOR UPDATE' : ''}`,
    [dispositionId],
  );
  if (!rows[0]) throw new ProductionDomainError('NOT_FOUND', '异常处置单不存在');
  return rows[0];
};

const selectCandidates = async (
  connection: Pool | PoolConnection,
  batchId: string,
  ids: string[] = [],
  lock = false,
): Promise<CandidateRow[]> => {
  const filter = ids.length ? ` AND id IN (${ids.map(() => '?').join(',')})` : '';
  const [rows] = await connection.query<CandidateRow[]>(
    `SELECT id,production_batch_id,product_material_id,item_id,quantity_per_unit_snapshot,unit_snapshot,
      is_key_material_snapshot,need_batch_record_snapshot,planned_output_quantity_snapshot,need_number
     FROM production_item_demand
     WHERE production_batch_id=? AND demand_type='normal' AND business_status='active'${filter}
     ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
    [batchId, ...ids],
  );
  return rows;
};

const selectPlan = async (
  connection: Pool | PoolConnection,
  dispositionId: string,
  lock = false,
): Promise<ProductionScrapSupplementPlanItem | null> => {
  const [rows] = await connection.query<PlanRow[]>(
    `SELECT id,plan_no,abnormal_disposition_id,production_batch_id,batch_step_record_id,
      source_report_id,material_end_step_record_id,status,confirmed_supplement_id,remark,version,updated_at
     FROM production_scrap_supplement_plan
     WHERE abnormal_disposition_id=?${lock ? ' FOR UPDATE' : ''}`,
    [dispositionId],
  );
  const row = rows[0];
  if (!row) return null;
  const [lines] = await connection.query<PlanLineRow[]>(
    `SELECT original_demand_id,product_material_id,item_id,planned_quantity,unit_snapshot
     FROM production_scrap_supplement_plan_line
     WHERE plan_id=? ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
    [row.id],
  );
  return {
    planId: String(row.id),
    planNo: row.plan_no,
    dispositionId: String(row.abnormal_disposition_id),
    productionBatchId: String(row.production_batch_id),
    sourceStepRecordId: String(row.batch_step_record_id),
    sourceReportId: String(row.source_report_id),
    materialEndStepRecordId: String(row.material_end_step_record_id),
    status: row.status,
    confirmedSupplementId:
      row.confirmed_supplement_id === null ? null : String(row.confirmed_supplement_id),
    remark: row.remark,
    version: row.version,
    updatedAt: toBeijingISOString(row.updated_at),
    lines: lines.map((line) => ({
      originalDemandId: String(line.original_demand_id),
      productMaterialId: String(line.product_material_id),
      itemId: String(line.item_id),
      itemCode: '',
      itemName: '',
      plannedQuantity: line.planned_quantity,
      unit: line.unit_snapshot,
    })),
  };
};

const mapCandidate = (row: CandidateRow): ProductionSupplementCandidateItem => ({
  originalDemandId: String(row.id),
  productionBatchId: String(row.production_batch_id),
  productMaterialId: String(row.product_material_id),
  itemId: String(row.item_id),
  itemCode: '',
  itemName: '',
  unit: row.unit_snapshot,
  normalDemandQuantity: row.need_number,
});

const mapDisposition = (row: SourceRow): BatchStepAbnormalDispositionItem => ({
  dispositionId: String(row.id),
  dispositionNo: row.disposition_no,
  productionBatchId: String(row.production_batch_id),
  stepRecordId: String(row.batch_step_record_id),
  sourceReportId: String(row.batch_step_report_id),
  abnormalOrigin: row.abnormal_origin,
  reviewStatus: row.review_status,
  dispositionType: row.disposition_type,
  remark: row.remark,
  version: row.version,
  createdAt: toBeijingISOString(row.created_at),
});

const requireActor = (context: CommandContext): string => {
  if (!context.actorId) throw new ProductionDomainError('INVALID_STATE', '缺少当前操作人');
  return context.actorId;
};

const selectRouteSteps = async (
  connection: Pool | PoolConnection,
  batchId: string,
): Promise<RouteStepRow[]> => {
  const [rows] = await connection.query<RouteStepRow[]>(
    `SELECT id,route_step_id,step_order_snapshot
     FROM batch_step_records
     WHERE production_batch_id=?
     ORDER BY step_order_snapshot,id`,
    [batchId],
  );
  return rows;
};

const requireMaterialEndStep = (
  source: SourceRow,
  routeSteps: RouteStepRow[],
  materialEndStepRecordId: string,
): RouteStepRow => {
  const selected = routeSteps.find((step) => String(step.id) === materialEndStepRecordId);
  if (!selected)
    throw new ProductionDomainError('INVALID_INPUT', '补料计算截止工序不属于当前生产批次');
  const latestAllowedOrder =
    source.abnormal_origin === 'previous_step'
      ? source.step_order_snapshot - 1
      : source.step_order_snapshot;
  if (selected.step_order_snapshot > latestAllowedOrder)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      source.abnormal_origin === 'previous_step'
        ? '前置异常的补料计算截止工序必须早于异常上报工序'
        : '补料计算截止工序不能晚于异常上报工序',
    );
  return selected;
};

const fixed = fixedIntegerQuantity;
