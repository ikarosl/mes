import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type {
  DemandCorrectionApprovalSnapshot,
  BatchStepStatus,
  DemandCorrectionCheck,
  DemandCorrectionHistoryItem,
  DemandCorrectionChainItem,
  SubmitDemandCorrectionPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import type { ApprovalSubjectPreparation } from '../../approval/public.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductionDemandCorrectionRepository } from '../application/ports/production-demand-correction.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { correctionRemaining } from '../domain/production-demand-correction.policy.js';
import { fixedIntegerQuantity } from '../domain/integer-quantity.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import { findBatch, type BatchRow } from './mysql-production.shared.js';
import {
  mysqlProductionDemandPlanWriter,
  type DemandPlanLine,
} from './mysql-production-demand-plan.writer.js';
import {
  fulfillReadySupplements,
  selectRouteSupplementSources,
} from './mysql-production-supplement-activation.js';
import { loadSupplementRequirements } from './mysql-production-supplement-requirements.js';
import { evaluateSupplementFulfillment } from '../domain/production-supplement-fulfillment.policy.js';
import {
  calculateRouteStepQuantities,
  supplementReopenedStepIds,
} from '../domain/production-route-quantity.policy.js';
import { writeInventoryAudit } from './mysql-production-inventory.shared.js';

type Demand = RowDataPacket & {
  id: number;
  production_batch_id: number;
  requirement_basis_id: number;
  product_material_id: number;
  item_id: number;
  material_variant_id: number;
  item_code_snapshot: string;
  material_variant_code_snapshot: string;
  unit_snapshot: string;
  quantity_per_unit_snapshot: string;
  planned_output_quantity_snapshot: string;
  need_number: string;
  remaining_number: string;
  demand_type: DemandCorrectionCheck['demandType'];
  business_status: DemandCorrectionChainItem['businessStatus'];
  close_cause: DemandCorrectionChainItem['closeCause'];
  parent_demand_id: number | null;
  manual_addition_id: number | null;
  supplement_id: number | null;
  replaces_demand_id: number | null;
  pending_correction_id: number | null;
  version: number;
};
type Correction = RowDataPacket & {
  id: number;
  old_demand_id: number;
  production_batch_id: number;
  correction_kind: 'quantity' | 'close';
  target_total_quantity: string;
  issued_quantity: string;
  old_remaining_quantity: string;
  new_remaining_quantity: string;
  reason: string;
  evidence: DemandCorrectionCheck | string;
  evidence_hash: string;
  approval_instance_id: number | null;
  new_demand_id: number | null;
  applied_at: Date | null;
  ended_at: Date | null;
  result_snapshot: { fulfilledSupplementIds: string[]; reopenedStepIds: string[] } | string | null;
  created_at: Date;
  version: number;
};
const id = (value: number | string | null): string | null =>
  value === null ? null : String(value);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class MysqlProductionDemandCorrectionRepository extends ProductionDemandCorrectionRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  getCheck(demandId: string): Promise<DemandCorrectionCheck> {
    return withTransaction(
      this.pool,
      async (db) => (await this.loadCheck(db, demandId, false)).check,
    );
  }

  listHistory(demandId: string): Promise<DemandCorrectionHistoryItem[]> {
    return withTransaction(this.pool, async (db) => {
      const { check } = await this.loadCheck(db, demandId, false);
      const ids = check.chain.map((line) => line.demandId);
      // 包含向后的替代链：任意一条历史需求都可查看完整纠错历史。
      let current = ids[ids.length - 1]!;
      while (true) {
        const [[next]] = await db.query<(RowDataPacket & { id: number })[]>(
          'SELECT id FROM production_item_demand WHERE replaces_demand_id=?',
          [current],
        );
        if (!next) break;
        current = String(next.id);
        if (ids.includes(current)) throw new ProductionDomainError('CONFLICT', '需求替代链异常');
        ids.push(current);
      }
      const [rows] = await db.query<Correction[]>(
        `SELECT * FROM production_demand_correction WHERE old_demand_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
        ids,
      );
      return rows.map((row) => {
        const result =
          row.result_snapshot === null
            ? { fulfilledSupplementIds: [], reopenedStepIds: [] }
            : typeof row.result_snapshot === 'string'
              ? (JSON.parse(row.result_snapshot) as {
                  fulfilledSupplementIds: string[];
                  reopenedStepIds: string[];
                })
              : row.result_snapshot;
        return {
          id: String(row.id),
          oldDemandId: String(row.old_demand_id),
          newDemandId: id(row.new_demand_id),
          approvalInstanceId: id(row.approval_instance_id),
          state: row.applied_at
            ? 'applied'
            : row.ended_at
              ? 'ended'
              : row.approval_instance_id
                ? 'pending'
                : 'draft',
          snapshot: this.snapshot(row),
          createdAt: toBeijingISOString(row.created_at),
          appliedAt: row.applied_at ? toBeijingISOString(row.applied_at) : null,
          ...result,
        };
      });
    });
  }

  createRequest(
    demandId: string,
    payload: SubmitDemandCorrectionPayload,
    context: CommandContext,
  ): Promise<string> {
    return withTransaction(this.pool, async (db) => {
      const { check } = await this.loadCheck(db, demandId, true);
      const remaining = correctionRemaining(check, payload);
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_demand_correction
          (old_demand_id,production_batch_id,correction_kind,target_total_quantity,issued_quantity,old_remaining_quantity,
           new_remaining_quantity,reason,evidence,evidence_hash,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          demandId,
          check.batchId,
          payload.kind,
          payload.targetTotalQuantity,
          check.issuedQuantity,
          check.oldRemainingQuantity,
          remaining,
          payload.reason,
          JSON.stringify(check),
          check.checkToken,
          context.actorId,
          context.actorId,
        ],
      );
      return String(created.insertId);
    });
  }

  prepare(
    correctionId: string,
    version: number,
    _context: CommandContext,
  ): Promise<ApprovalSubjectPreparation> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.lockRequest(db, correctionId);
      if (row.version !== version || row.approval_instance_id !== null || row.ended_at !== null)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '更正申请已送审或结束');
      const { check } = await this.loadCheck(db, String(row.old_demand_id), true);
      if (!check.canCorrect || check.checkToken !== row.evidence_hash)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '更正依据已变化，请重新核对');
      return {
        title: `${check.workOrderNo} / ${check.batchNo} · ${check.itemCode} 需求更正`,
        subjectVersion: row.version,
        snapshotSchemaVersion: 1,
        businessAssigneeResolutions: [],
        snapshot: this.snapshot(row),
      };
    });
  }

  bind(
    correctionId: string,
    instanceId: string,
    version: number,
    context: CommandContext,
  ): Promise<number> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.lockRequest(db, correctionId);
      if (row.version !== version || row.approval_instance_id !== null || row.ended_at !== null)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '更正申请已变化');
      const check = this.snapshot(row).check;
      await db.execute(
        'UPDATE production_demand_correction SET approval_instance_id=?,version=version+1,updated_by=? WHERE id=?',
        [instanceId, context.actorId, correctionId],
      );
      const [bound] = await db.execute<ResultSetHeader>(
        `UPDATE production_item_demand SET pending_correction_id=?,version=version+1,updated_by=?
         WHERE id=? AND business_status='active' AND pending_correction_id IS NULL AND version=?`,
        [correctionId, context.actorId, row.old_demand_id, check.version],
      );
      if (bound.affectedRows !== 1)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '需求已变化或已有在审更正');
      await writeInventoryAudit(
        db,
        context,
        'production-demand.correction.submit',
        'production_item_demand',
        String(row.old_demand_id),
        { version: check.version },
        { correctionId, instanceId, targetTotalQuantity: row.target_total_quantity },
      );
      return version + 1;
    });
  }

  lock(correctionId: string, instanceId: string, version: number): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      await this.current(db, correctionId, instanceId, version);
    });
  }

  restore(
    correctionId: string,
    instanceId: string,
    version: number,
    context: CommandContext,
  ): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.current(db, correctionId, instanceId, version);
      await db.execute(
        `UPDATE production_item_demand SET pending_correction_id=NULL,version=version+1,updated_by=?
        WHERE id=? AND pending_correction_id=?`,
        [context.actorId, row.old_demand_id, correctionId],
      );
      await db.execute(
        'UPDATE production_demand_correction SET ended_at=NOW(),version=version+1,updated_by=? WHERE id=?',
        [context.actorId, correctionId],
      );
      await writeInventoryAudit(
        db,
        context,
        'production-demand.correction.end',
        'production_item_demand',
        String(row.old_demand_id),
        { correctionId },
        { instanceId, unfrozen: true },
      );
    });
  }

  finalize(
    correctionId: string,
    instanceId: string,
    version: number,
    context: CommandContext,
  ): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少操作人');
      const row = await this.current(db, correctionId, instanceId, version);
      const { check, demand, batch, additionNo } = await this.loadCheck(
        db,
        String(row.old_demand_id),
        true,
        correctionId,
      );
      if (!check.canCorrect || check.checkToken !== row.evidence_hash)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '领退料、损耗或补产影响已变化，请驳回或撤回后重新复核送审',
        );
      const newQuantity = Number(row.new_remaining_quantity);
      const closeCause =
        row.correction_kind === 'close'
          ? 'single_close'
          : newQuantity > 0
            ? 'correction_replaced'
            : 'correction_exhausted';
      // 只释放该需求未出库预留。已领料仍从旧分配/旧需求追溯并办理退料。
      await db.execute(
        `UPDATE production_item_allocation SET allocation_status='released',version=version+1,updated_by=?
        WHERE demand_id=? AND allocation_status='active' AND assigned_number>COALESCE((
          SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
          WHERE od.allocation_id=production_item_allocation.id AND oo.status='completed'),0)`,
        [context.actorId, demand.id],
      );
      const line: DemandPlanLine = {
        identityId: correctionId,
        requirementBasisId: demand.requirement_basis_id,
        productMaterialId: demand.product_material_id,
        itemId: demand.item_id,
        materialVariantId: demand.material_variant_id,
        materialVariantCode: demand.material_variant_code_snapshot,
        itemCode: demand.item_code_snapshot,
        quantityPerUnit: demand.quantity_per_unit_snapshot,
        unit: demand.unit_snapshot,
        plannedOutputQuantity: demand.planned_output_quantity_snapshot,
        needNumber: newQuantity,
        demandType: demand.demand_type,
        parentDemandId: demand.parent_demand_id,
        supplementId: demand.supplement_id,
        manualAdditionId: demand.manual_addition_id,
        replacesDemandId: demand.id,
      };
      const newDemandId = await mysqlProductionDemandPlanWriter.applyCorrection(db, {
        demandId: String(demand.id),
        correctionId,
        batchId: String(batch.id),
        actorId: context.actorId,
        reason: row.reason,
        closeCause,
        expectedBatchVersion: batch.version,
        source:
          demand.demand_type === 'scrap_supplement'
            ? { type: 'scrap_supplement', supplementId: demand.supplement_id!, correctionId }
            : {
                type: 'manual_additional',
                productionBatchId: batch.id,
                businessActionNo: additionNo!,
                correctionId,
              },
        lines: newQuantity > 0 ? [line] : [],
      });
      await db.execute(
        `UPDATE production_demand_correction SET new_demand_id=?,applied_by=?,applied_at=NOW(),ended_at=NOW(),
        result_snapshot=JSON_OBJECT('fulfilledSupplementIds',JSON_ARRAY(),'reopenedStepIds',JSON_ARRAY()),version=version+1,updated_by=? WHERE id=?`,
        [newDemandId, context.actorId, context.actorId, correctionId],
      );
      await db.query(
        'SELECT id FROM batch_step_records WHERE production_batch_id=? ORDER BY id FOR UPDATE',
        [batch.id],
      );
      const activation = await fulfillReadySupplements(
        db,
        String(batch.id),
        batch.planned_quantity,
        context.actorId,
      );
      await db.execute('UPDATE production_demand_correction SET result_snapshot=? WHERE id=?', [
        JSON.stringify(activation),
        correctionId,
      ]);
      // 未开工的分配状态重新按全部当前需求核对；已开工任务继续保持 doing。
      if (['material_pending', 'material_assigned'].includes(batch.status)) {
        await db.execute(
          `UPDATE production_batches b SET status=IF(EXISTS (
          SELECT 1 FROM production_item_demand d WHERE d.production_batch_id=b.id AND d.business_status='active'
          AND (d.pending_correction_id IS NOT NULL OR d.need_number>COALESCE((SELECT SUM(a.assigned_number)
            FROM production_item_allocation a WHERE a.demand_id=d.id AND a.allocation_status='active'),0))
        ),'material_pending','material_assigned') WHERE b.id=?`,
          [batch.id],
        );
      }
      await writeInventoryAudit(
        db,
        context,
        'production-demand.correction.apply',
        'production_item_demand',
        String(demand.id),
        { needNumber: demand.need_number, remainingNumber: demand.remaining_number },
        {
          correctionId,
          instanceId,
          newDemandId,
          closeCause,
          materialPlanVersion: batch.material_plan_version + 1,
          ...activation,
        },
      );
    });
  }

  private snapshot(row: Correction): DemandCorrectionApprovalSnapshot {
    return {
      kind: 'demand_correction',
      correctionId: String(row.id),
      check:
        typeof row.evidence === 'string'
          ? (JSON.parse(row.evidence) as DemandCorrectionCheck)
          : row.evidence,
      correctionKind: row.correction_kind,
      targetTotalQuantity: Number(row.target_total_quantity),
      newRemainingQuantity: Number(row.new_remaining_quantity),
      reason: row.reason,
    };
  }

  private async lockRequest(db: PoolConnection, correctionId: string): Promise<Correction> {
    const [[locator]] = await db.query<Correction[]>(
      'SELECT production_batch_id FROM production_demand_correction WHERE id=?',
      [correctionId],
    );
    if (!locator) throw new ProductionDomainError('NOT_FOUND', '更正申请不存在');
    await lockWorkOrderForBatch(db, String(locator.production_batch_id));
    await findBatch(db, String(locator.production_batch_id), true);
    const [[row]] = await db.query<Correction[]>(
      'SELECT * FROM production_demand_correction WHERE id=? FOR UPDATE',
      [correctionId],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '更正申请不存在');
    return row;
  }

  private async current(
    db: PoolConnection,
    correctionId: string,
    instanceId: string,
    version: number,
  ): Promise<Correction> {
    const row = await this.lockRequest(db, correctionId);
    const [[demand]] = await db.query<Demand[]>(
      'SELECT * FROM production_item_demand WHERE id=? FOR UPDATE',
      [row.old_demand_id],
    );
    if (
      row.version !== version ||
      id(row.approval_instance_id) !== instanceId ||
      row.ended_at !== null ||
      !demand ||
      id(demand.pending_correction_id) !== correctionId ||
      demand.business_status !== 'active'
    )
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '需求更正申请或冻结关联已变化');
    return row;
  }

  private async loadCheck(
    db: PoolConnection,
    demandId: string,
    lock: boolean,
    ownCorrectionId?: string,
  ): Promise<{
    check: DemandCorrectionCheck;
    demand: Demand;
    batch: BatchRow;
    additionNo: string | null;
  }> {
    const [[locator]] = await db.query<Demand[]>(
      'SELECT production_batch_id FROM production_item_demand WHERE id=?',
      [demandId],
    );
    if (!locator) throw new ProductionDomainError('NOT_FOUND', '需求不存在');
    const batchId = String(locator.production_batch_id);
    if (lock) await lockWorkOrderForBatch(db, batchId);
    const batch = await findBatch(db, batchId, lock);
    const suffix = lock ? ' FOR SHARE' : '';
    const [[demand]] = await db.query<Demand[]>(
      `SELECT * FROM production_item_demand WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
      [demandId],
    );
    if (!demand) throw new ProductionDomainError('NOT_FOUND', '需求不存在');
    const chainRows: Demand[] = [demand];
    let parent = demand.replaces_demand_id;
    while (parent !== null) {
      if (chainRows.some((row) => String(row.id) === String(parent)))
        throw new ProductionDomainError('CONFLICT', '需求替代链异常');
      const [[previous]] = await db.query<Demand[]>(
        `SELECT * FROM production_item_demand WHERE id=?${suffix}`,
        [parent],
      );
      if (
        !previous ||
        previous.production_batch_id !== demand.production_batch_id ||
        previous.item_id !== demand.item_id ||
        previous.material_variant_id !== demand.material_variant_id ||
        previous.unit_snapshot !== demand.unit_snapshot
      )
        throw new ProductionDomainError('CONFLICT', '需求替代来源不一致');
      chainRows.unshift(previous);
      parent = previous.replaces_demand_id;
    }
    const chainIds = chainRows.map((row) => String(row.id));
    const [outbounds] = await db.query<
      (RowDataPacket & {
        id: number;
        demand_id: number;
        outbound_number: string;
        status: string;
        outbound_no: string;
      })[]
    >(
      `SELECT od.id,od.demand_id,od.outbound_number,oo.status,oo.outbound_no FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
       WHERE od.demand_id IN (${chainIds.map(() => '?').join(',')}) ORDER BY od.id${suffix}`,
      chainIds,
    );
    const chain = chainRows.map((row): DemandCorrectionChainItem => ({
      demandId: String(row.id),
      replacesDemandId: id(row.replaces_demand_id),
      demandQuantity: row.need_number,
      remainingQuantity: String(row.remaining_number),
      businessStatus: row.business_status,
      closeCause: row.close_cause,
      outboundQuantity: fixedIntegerQuantity(
        outbounds
          .filter((o) => String(o.demand_id) === String(row.id) && o.status === 'completed')
          .reduce((sum, o) => sum + Number(o.outbound_number), 0),
      ),
    }));
    const issued = chain.reduce((sum, row) => sum + Number(row.outboundQuantity), 0);
    const [allocations] = await db.query<
      (RowDataPacket & {
        id: number;
        batch_code: string;
        assigned_number: string;
        allocation_status: string;
        version: number;
        issued: string;
      })[]
    >(
      `SELECT a.id,ib.batch_code,a.assigned_number,a.allocation_status,a.version,
        COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
          WHERE od.allocation_id=a.id AND oo.status='completed'${suffix}),0) issued
       FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id WHERE a.demand_id=? ORDER BY a.id${suffix}`,
      [demandId],
    );
    const [returns] = await db.query<RowDataPacket[]>(
      `SELECT rd.id,rd.return_number,ro.status FROM return_detail rd JOIN return_order ro ON ro.id=rd.return_id
      WHERE rd.demand_id IN (${chainIds.map(() => '?').join(',')}) ORDER BY rd.id${suffix}`,
      chainIds,
    );
    const [losses] = await db.query<(RowDataPacket & { status: string })[]>(
      `SELECT id,scrap_number,status FROM item_scrap
      WHERE demand_id IN (${chainIds.map(() => '?').join(',')}) ORDER BY id${suffix}`,
      chainIds,
    );
    const [[addition]] =
      demand.manual_addition_id === null
        ? [[]]
        : await db.query<(RowDataPacket & { addition_no: string; reason: string })[]>(
            `SELECT addition_no,reason FROM production_manual_demand_addition WHERE id=?${suffix}`,
            [demand.manual_addition_id],
          );
    const [[supplement]] =
      demand.supplement_id === null
        ? [[]]
        : await db.query<
            (RowDataPacket & { supplement_no: string; status: string; reason: string | null })[]
          >(
            `SELECT supplement_no,status,remark reason FROM production_material_supplement WHERE id=?${suffix}`,
            [demand.supplement_id],
          );
    const [authorizations] = await db.query<
      (RowDataPacket & { id: string; quantity: string; stepName: string })[]
    >(
      `SELECT CAST(a.id AS CHAR) id,a.authorized_quantity quantity,s.step_name_snapshot stepName
       FROM batch_step_scrap_reproduction_authorization a JOIN batch_step_records s ON s.id=a.quota_end_step_record_id
       WHERE a.supplement_id=? ORDER BY a.id${suffix}`,
      [demand.supplement_id],
    );
    const pendingCorrectionId = id(demand.pending_correction_id);
    const ownPending = ownCorrectionId !== undefined && pendingCorrectionId === ownCorrectionId;
    const [steps] =
      demand.supplement_id === null
        ? [[]]
        : await db.query<
            (RowDataPacket & {
              stepId: string;
              stepName: string;
              status: BatchStepStatus;
              version: number;
              stepOrder: number;
              effectiveNormal: string;
            })[]
          >(
            `SELECT CAST(s.id AS CHAR) stepId,s.step_name_snapshot stepName,s.status,s.version,s.step_order_snapshot stepOrder,
        COALESCE((SELECT SUM(CASE WHEN r.report_type='normal' THEN r.normal_quantity ELSE -r.normal_quantity END)
          FROM batch_step_reports r WHERE r.batch_step_record_id=s.id${suffix}),0) effectiveNormal
       FROM batch_step_records s WHERE s.production_batch_id=? ORDER BY s.step_order_snapshot,s.id${suffix}`,
            [batchId],
          );
    const [requirementRows] =
      demand.supplement_id === null
        ? [[]]
        : await db.query<Demand[]>(
            `SELECT * FROM production_item_demand WHERE supplement_id=? ORDER BY id${suffix}`,
            [demand.supplement_id],
          );
    const supplementRequirements: DemandCorrectionCheck['supplementRequirements'] =
      requirementRows.map((row) => ({
        demandId: String(row.id),
        replacesDemandId: id(row.replaces_demand_id),
        demandQuantity: String(row.need_number),
        remainingQuantity: String(row.remaining_number),
        outboundQuantity: fixedIntegerQuantity(
          Number(row.need_number) - Number(row.remaining_number),
        ),
        businessStatus: row.business_status,
        closeCause: row.close_cause,
        itemCode: row.item_code_snapshot,
        materialVariantCode: row.material_variant_code_snapshot,
        unit: row.unit_snapshot,
        pendingCorrectionId:
          ownPending && String(row.id) === demandId ? null : id(row.pending_correction_id),
      }));
    const [originalPlan] =
      demand.supplement_id === null
        ? [[]]
        : await db.query<(RowDataPacket & DemandCorrectionCheck['originalPlan'][number])[]>(
            `SELECT CAST(p.id AS CHAR) planId,CAST(l.original_demand_id AS CHAR) originalDemandId,l.planned_quantity plannedQuantity
       FROM production_scrap_supplement_plan p JOIN production_scrap_supplement_plan_line l ON l.plan_id=p.id
       WHERE p.confirmed_supplement_id=? ORDER BY l.id${suffix}`,
            [demand.supplement_id],
          );
    const sources =
      demand.supplement_id === null
        ? []
        : ((await selectRouteSupplementSources(db, [batchId], lock)).get(batchId) ?? []);
    let zeroRemainderImpact: DemandCorrectionCheck['zeroRemainderImpact'] = null;
    if (demand.supplement_id !== null) {
      const requirements = await loadSupplementRequirements(db, String(demand.supplement_id), lock);
      const simulated = requirements.map((requirement) =>
        requirement.id !== demandId
          ? requirement
          : {
              ...requirement,
              status: 'closed' as const,
              pendingCorrectionId: null,
              closeCause: 'correction_exhausted' as const,
              correction: {
                applied: true,
                newDemandId: null,
                targetTotalQuantity: issued,
                issuedQuantity: issued,
                newRemainingQuantity: 0,
              },
            },
      );
      const readiness = evaluateSupplementFulfillment(simulated);
      const simulatedSources = sources.map((source) =>
        source.supplementId === String(demand.supplement_id) && readiness.fulfilled
          ? { ...source, status: 'material_ready' as const }
          : source,
      );
      const routeSteps = steps.map((step) => ({
        id: step.stepId,
        stepOrder: step.stepOrder,
        status: step.status,
        effectiveNormal: step.effectiveNormal,
        effectiveDirectReported: 0,
      }));
      const quantities = calculateRouteStepQuantities(
        batch.planned_quantity,
        routeSteps,
        simulatedSources,
      );
      const reopened = supplementReopenedStepIds(
        routeSteps,
        quantities,
        simulatedSources,
        readiness.fulfilled ? [String(demand.supplement_id)] : [],
      );
      zeroRemainderImpact = {
        fulfillsSupplement: readiness.fulfilled,
        blockingDemandIds: readiness.blockingDemandIds,
        hasConfirmedIssue: simulated.some((requirement) => requirement.issuedQuantity > 0),
        reopenedSteps: steps
          .filter((step) => reopened.includes(step.stepId))
          .map((step) => ({
            stepId: step.stepId,
            stepName: step.stepName,
            requiredNormalQuantity: quantities.get(step.stepId)!.requiredNormalQuantity,
          })),
      };
    }
    const blockers: string[] = [];
    if (!['manual_additional', 'scrap_supplement'].includes(demand.demand_type))
      blockers.push(
        demand.demand_type === 'normal'
          ? '初始 BOM 需求不支持单条更正；停止生产时请走批次收尾'
          : '损耗补料需求依据已确认的损耗生成，不支持在此更正数量',
      );
    if (demand.business_status !== 'active')
      blockers.push(
        demand.business_status === 'fulfilled'
          ? '本需求已全部领料，没有待更正的未领数量'
          : '本需求已关闭或取消，不能再次更正',
      );
    if (pendingCorrectionId && !ownPending) blockers.push('该需求已有在审更正');
    if (
      ![
        'material_pending',
        'material_assigned',
        'material_partially_outbound',
        'material_outbound',
        'doing',
      ].includes(batch.status)
    )
      blockers.push('批次当前不允许更正需求');
    if (demand.supplement_id !== null && supplement?.status !== 'approved')
      blockers.push('原补料单已完成领料或已取消，不能再更正其需求');
    const pendingOutboundNos = [
      ...new Set(
        outbounds
          .filter(
            (o) =>
              String(o.demand_id) === demandId && !['completed', 'cancelled'].includes(o.status),
          )
          .map((o) => o.outbound_no),
      ),
    ];
    if (pendingOutboundNos.length)
      blockers.push('请先处理涉及本需求的待出库单；混合单须核对其他需求的领料安排');
    if (allocations.some((a) => ['frozen', 'abnormal'].includes(a.allocation_status)))
      blockers.push('请先处理冻结或异常分配');
    if (losses.some((loss) => loss.status === 'pending'))
      blockers.push('请先处理本需求来源链的待确认损耗');
    const body: Omit<DemandCorrectionCheck, 'checkToken'> = {
      demandId,
      batchId,
      batchNo: batch.batch_no,
      workOrderNo: batch.work_order_no,
      materialId: String(demand.item_id),
      itemCode: demand.item_code_snapshot,
      materialVariantCode: demand.material_variant_code_snapshot,
      unit: demand.unit_snapshot,
      demandType: demand.demand_type,
      parentDemandId: id(demand.parent_demand_id),
      manualAdditionId: id(demand.manual_addition_id),
      supplementId: id(demand.supplement_id),
      supplementNo: supplement?.supplement_no ?? null,
      sourceReason: addition?.reason ?? supplement?.reason ?? null,
      version: Number(demand.version) - (ownPending ? 1 : 0),
      currentTotalQuantity: fixedIntegerQuantity(issued + Number(demand.remaining_number)),
      issuedQuantity: fixedIntegerQuantity(issued),
      oldRemainingQuantity: String(demand.remaining_number),
      pendingCorrectionId: ownPending ? null : pendingCorrectionId,
      chain,
      reservations: allocations
        .filter(
          (a) => a.allocation_status === 'active' && Number(a.assigned_number) > Number(a.issued),
        )
        .map((a) => ({
          allocationId: String(a.id),
          inventoryBatchCode: a.batch_code,
          quantity: fixedIntegerQuantity(Number(a.assigned_number) - Number(a.issued)),
          version: a.version,
        })),
      pendingOutboundNos,
      authorizations,
      supplementRequirements,
      originalPlan,
      zeroRemainderImpact,
      blockers,
      canCorrect: blockers.length === 0,
    };
    return {
      check: { ...body, checkToken: hash({ body, returns, losses, steps, sources }) },
      demand,
      batch,
      additionNo: addition?.addition_no ?? null,
    };
  }
}
