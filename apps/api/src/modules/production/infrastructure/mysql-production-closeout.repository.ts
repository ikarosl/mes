import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BatchCloseoutDetail,
  BatchCloseoutAction,
  BatchCloseoutApprovalSnapshot,
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  SaveBatchCloseoutOutputPayload,
  SubmitBatchCloseoutPayload,
  BatchCloseoutCommandResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import type { ApprovalSubjectPreparation } from '../../approval/public.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { ProductionCloseoutRepository } from '../application/ports/production-closeout.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { requireBatchTransition } from '../domain/production-status.policy.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import { findBatch } from './mysql-production.shared.js';
import { MysqlProductionTerminationRepository } from './mysql-production-termination.repository.js';
import { mysqlProductionDemandPlanWriter } from './mysql-production-demand-plan.writer.js';
import { writeInventoryAudit } from './mysql-production-inventory.shared.js';
import { closeoutSnapshotSchema } from '../application/production-approval-snapshot.schema.js';
import { loadCloseoutItems } from './mysql-production-closeout-items.js';
import { allocationNeedsCloseoutSql } from './mysql-production-material.sql.js';

type Closeout = RowDataPacket & {
  id: number;
  production_batch_id: number;
  reason: string;
  available_quantity: string | null;
  additional_scrap_quantity: string | null;
  material_review_note: string | null;
  approval_instance_id: number | null;
  pending_approval_id: number | null;
  termination_id: number | null;
  review_snapshot: object | string | null;
  version: number;
};
type Action = RowDataPacket & {
  id: number;
  item_kind: BatchCloseoutAction['kind'];
  target_id: number;
  label: string;
  previous_status: string;
  resulting_status: string;
  reason: string;
  fact_snapshot: object | string;
  created_by: number;
  created_at: Date;
};
const nullableId = (value: number | null) => (value === null ? null : String(value));
const json = (value: object | string | null): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;

@Injectable()
export class MysqlProductionCloseoutRepository extends ProductionCloseoutRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly termination: MysqlProductionTerminationRepository,
  ) {
    super();
  }

  detail(batchId: string): Promise<BatchCloseoutDetail | null> {
    return withTransaction(this.pool, async (db) => {
      const [[row]] = await db.query<Closeout[]>(
        'SELECT * FROM production_batch_closeout WHERE production_batch_id=?',
        [batchId],
      );
      return row ? this.loadDetail(db, row, false) : null;
    });
  }

  begin(
    batchId: string,
    payload: BeginBatchCloseoutPayload,
    context: CommandContext,
  ): Promise<BatchCloseoutCommandResult> {
    return withTransaction(this.pool, async (db) => {
      this.actor(context);
      await lockWorkOrderForBatch(db, batchId);
      const batch = await findBatch(db, batchId, true);
      if (batch.version !== payload.version)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '生产任务已变化');
      requireBatchTransition(batch.status, 'closing');
      const check = await this.termination.loadCheck(db, batchId, true);
      // 待出库、异常分配和损耗可在进入收尾后逐项处理；在途纠错先结束。
      if (!['released', 'doing'].includes(check.workOrderStatus))
        throw new ProductionDomainError('INVALID_STATE', '工单已结束');
      const [[pending]] = await db.query<RowDataPacket[]>(
        `SELECT id FROM production_item_demand WHERE production_batch_id=? AND pending_correction_id IS NOT NULL LIMIT 1 FOR UPDATE`,
        [batchId],
      );
      if (pending)
        throw new ProductionDomainError('INVALID_STATE', '先撤回或驳回在途需求更正，再开始收尾');
      if (!payload.reason.trim())
        throw new ProductionDomainError('INVALID_INPUT', '请填写收尾原因');
      const [created] = await db.execute<ResultSetHeader>(
        'INSERT INTO production_batch_closeout (production_batch_id,reason,created_by,updated_by) VALUES (?,?,?,?)',
        [batchId, payload.reason, context.actorId, context.actorId],
      );
      await db.execute(
        "UPDATE production_batches SET status='closing',version=version+1,updated_by=? WHERE id=?",
        [context.actorId, batchId],
      );
      await db.execute(
        "UPDATE production_short_batch_authorization SET status='superseded',version=version+1 WHERE production_batch_id=? AND status='active'",
        [batchId],
      );
      const result = { closeoutId: String(created.insertId), batchId };
      await writeInventoryAudit(
        db,
        context,
        'production-batch.closeout.begin',
        'production_batch',
        batchId,
        { status: batch.status },
        { ...result, reason: payload.reason, status: 'closing' },
      );
      return result;
    });
  }

  handle(
    batchId: string,
    payload: HandleBatchCloseoutItemPayload,
    context: CommandContext,
  ): Promise<BatchCloseoutCommandResult> {
    return withTransaction(this.pool, async (db) => {
      this.actor(context);
      const row = await this.lockBatch(db, batchId);
      this.editable(row, payload.version);
      if (!payload.reason.trim())
        throw new ProductionDomainError('INVALID_INPUT', '请填写本项处理说明');
      const detail = await this.loadDetail(db, row, true);
      if (detail.check.checkToken !== payload.checkToken)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '本项处理所依据的物料或单据已变化，请刷新核对',
        );
      let label: string, previousStatus: string, resultingStatus: string, fact: object;
      if (payload.kind === 'material') {
        const material = detail.check.materials.find((m) => m.allocationId === payload.targetId);
        if (!material) throw new ProductionDomainError('NOT_FOUND', '物料来源不存在');
        label = `${material.itemCode} / ${material.inventoryBatchCode}`;
        previousStatus = 'unreviewed';
        resultingStatus = 'reviewed';
        fact = material;
      } else {
        const impact = detail.pendingItems.find(
          (i) => i.kind === payload.kind && i.id === payload.targetId,
        );
        if (!impact || impact.version !== payload.targetVersion)
          throw new ProductionDomainError('CONCURRENT_MODIFICATION', '待处理事项已经变化');
        if (impact.blockedReason)
          throw new ProductionDomainError('INVALID_STATE', impact.blockedReason);
        label = impact.label;
        previousStatus = impact.status;
        // 行动只固化原事项事实，不固化工作台的动态解锁投影。
        fact = detail.check.impacts.find((i) => i.kind === impact.kind && i.id === impact.id)!;
        resultingStatus = await this.handleImpact(db, row, payload, context);
      }
      await db.execute(
        `INSERT INTO production_batch_closeout_action
        (closeout_id,item_kind,target_id,label,previous_status,resulting_status,reason,fact_snapshot,created_by)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          row.id,
          payload.kind,
          payload.targetId,
          label,
          previousStatus,
          resultingStatus,
          payload.reason,
          JSON.stringify(fact),
          context.actorId,
        ],
      );
      await db.execute(
        'UPDATE production_batch_closeout SET version=version+1,updated_by=? WHERE id=?',
        [context.actorId, row.id],
      );
      await writeInventoryAudit(
        db,
        context,
        'production-batch.closeout.handle',
        'production_batch',
        batchId,
        { kind: payload.kind, targetId: payload.targetId, previousStatus },
        { closeoutId: String(row.id), resultingStatus, reason: payload.reason },
      );
      return { closeoutId: String(row.id), batchId };
    });
  }

  private async handleImpact(
    db: PoolConnection,
    row: Closeout,
    payload: HandleBatchCloseoutItemPayload,
    context: CommandContext,
  ): Promise<string> {
    const batchId = String(row.production_batch_id);
    const actor = context.actorId!;
    const args = [actor, payload.targetId, batchId];
    const update = async (sql: string, values: (string | number | null)[]) => {
      const [result] = await db.execute<ResultSetHeader>(sql, values);
      if (result.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '本项状态已变化或不支持直接结束，请先在对应管理页处理',
        );
    };
    switch (payload.kind) {
      case 'outbound':
        await update(
          `UPDATE outbound_order SET status='cancelled',cancel_source='production_termination',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),version=version+1,updated_by=?
          WHERE id=? AND production_batch_id=? AND status='pending_picking'`,
          [payload.reason, actor, ...args],
        );
        return 'cancelled';
      case 'allocation': {
        const [[pending]] = await db.query<RowDataPacket[]>(
          `SELECT od.id FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
          WHERE od.allocation_id=? AND oo.status NOT IN ('completed','cancelled') LIMIT 1 FOR SHARE`,
          [payload.targetId],
        );
        if (pending) throw new ProductionDomainError('INVALID_STATE', '先处理该分配的待出库单');
        await update(
          `UPDATE production_item_allocation SET allocation_status='released',version=version+1,updated_by=?
          WHERE id=? AND production_batch_id=? AND allocation_status NOT IN ('released','cancelled')`,
          args,
        );
        return 'released';
      }
      case 'demand': {
        const [[reservation]] = await db.query<RowDataPacket[]>(
          `SELECT id FROM production_item_allocation WHERE demand_id=?
           AND ${allocationNeedsCloseoutSql('production_item_allocation', true)} LIMIT 1 FOR SHARE`,
          [payload.targetId],
        );
        if (reservation)
          throw new ProductionDomainError(
            'INVALID_STATE',
            '先处理该需求的出库单、剩余预留及冻结或异常分配，再关闭剩余要求',
          );
        const batch = await findBatch(db, batchId, true);
        await mysqlProductionDemandPlanWriter.closeDemandForCloseout(db, {
          batchId,
          demandId: payload.targetId,
          closeoutId: String(row.id),
          actorId: actor,
          reason: payload.reason,
          expectedBatchVersion: batch.version,
        });
        return 'closed';
      }
      case 'step':
        await update(
          `UPDATE batch_step_records SET status='terminated',closeout_id=?,terminated_by=?,terminated_at=NOW(),termination_reason=?,version=version+1,updated_by=?
          WHERE id=? AND production_batch_id=? AND status IN ('pending','assigned','doing')`,
          [row.id, actor, payload.reason, ...args],
        );
        return 'terminated';
      case 'abnormal':
        await update(
          `UPDATE batch_step_abnormal_dispositions SET review_status='terminated',reviewed_by=?,reviewed_at=NOW(),version=version+1,updated_by=?
          WHERE id=? AND production_batch_id=? AND review_status='pending_review'`,
          [actor, ...args],
        );
        return 'terminated';
      case 'rework':
        await update(
          "UPDATE rework_records SET status='cancelled',version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND status IN ('pending','doing')",
          args,
        );
        return 'cancelled';
      case 'supplement': {
        const [[active]] = await db.query<RowDataPacket[]>(
          "SELECT id FROM production_item_demand WHERE supplement_id=? AND business_status='active' LIMIT 1 FOR SHARE",
          [payload.targetId],
        );
        if (active)
          throw new ProductionDomainError('INVALID_STATE', '先逐项关闭该补料单的剩余需求');
        await update(
          "UPDATE production_material_supplement SET status='cancelled',version=version+1,updated_by=? WHERE id=? AND production_batch_id=? AND status='approved'",
          args,
        );
        return 'cancelled';
      }
      default:
        throw new ProductionDomainError('INVALID_INPUT', '不支持的收尾事项');
    }
  }

  saveOutput(
    batchId: string,
    payload: SaveBatchCloseoutOutputPayload,
    context: CommandContext,
  ): Promise<BatchCloseoutCommandResult> {
    return withTransaction(this.pool, async (db) => {
      this.actor(context);
      const row = await this.lockBatch(db, batchId);
      this.editable(row, payload.version);
      const check = await this.termination.loadCheck(db, batchId, true);
      if (
        !payload.reason.trim() ||
        !payload.materialReviewNote.trim() ||
        !Number.isSafeInteger(payload.availableQuantity) ||
        payload.availableQuantity < 0 ||
        !Number.isSafeInteger(payload.additionalScrapQuantity) ||
        payload.additionalScrapQuantity < 0 ||
        payload.availableQuantity +
          payload.additionalScrapQuantity +
          Number(check.existingScrapQuantity) >
          99_999_999
      )
        throw new ProductionDomainError('INVALID_INPUT', '请核对产出数量、原因及物料说明');
      await db.execute(
        `UPDATE production_batch_closeout SET available_quantity=?,additional_scrap_quantity=?,reason=?,material_review_note=?,version=version+1,updated_by=? WHERE id=?`,
        [
          payload.availableQuantity,
          payload.additionalScrapQuantity,
          payload.reason,
          payload.materialReviewNote,
          context.actorId,
          row.id,
        ],
      );
      await writeInventoryAudit(
        db,
        context,
        'production-batch.closeout.output',
        'production_batch',
        batchId,
        null,
        { closeoutId: String(row.id), ...payload },
      );
      return { closeoutId: String(row.id), batchId };
    });
  }

  validateSubmission(batchId: string, payload: SubmitBatchCloseoutPayload): Promise<string> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.lockBatch(db, batchId);
      this.editable(row, payload.version);
      const detail = await this.loadDetail(db, row, true);
      if (!detail.canSubmit)
        throw new ProductionDomainError('INVALID_STATE', detail.blockers.join('；'));
      if (detail.check.checkToken !== payload.checkToken)
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '收尾核对内容已变化');
      return String(row.id);
    });
  }

  prepare(
    closeoutId: string,
    version: number,
    _context: CommandContext,
  ): Promise<ApprovalSubjectPreparation> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.lockId(db, closeoutId);
      this.editable(row, version);
      const detail = await this.loadDetail(db, row, true);
      if (!detail.canSubmit || !detail.output)
        throw new ProductionDomainError('INVALID_STATE', detail.blockers.join('；'));
      const snapshot: BatchCloseoutApprovalSnapshot = {
        kind: 'batch_closeout',
        closeoutId,
        check: detail.check,
        output: detail.output,
        actions: detail.actions,
      };
      return {
        title: `${detail.check.workOrderNo} / ${detail.check.batchNo} · 短产 / 提前结束`,
        subjectVersion: row.version,
        snapshotSchemaVersion: 1,
        snapshot,
      };
    });
  }

  bind(
    closeoutId: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<number> {
    return withTransaction(this.pool, async (db) => {
      const prepared = await this.prepare(closeoutId, version, context);
      await db.execute(
        'UPDATE production_batch_closeout SET approval_instance_id=?,pending_approval_id=?,review_snapshot=?,version=version+1,updated_by=? WHERE id=?',
        [instance, instance, JSON.stringify(prepared.snapshot), context.actorId, closeoutId],
      );
      return version + 1;
    });
  }
  lock(closeoutId: string, instance: string, version: number): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      await this.current(db, closeoutId, instance, version);
    });
  }
  restore(
    closeoutId: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.current(db, closeoutId, instance, version);
      await db.execute(
        'UPDATE production_batch_closeout SET pending_approval_id=NULL,version=version+1,updated_by=? WHERE id=?',
        [context.actorId, row.id],
      );
      await writeInventoryAudit(
        db,
        context,
        'production-batch.closeout.review-end',
        'production_batch',
        String(row.production_batch_id),
        { instance },
        { status: 'closing', handledItemsRetained: true },
      );
    });
  }
  finalize(
    closeoutId: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<void> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.current(db, closeoutId, instance, version);
      const snapshot = closeoutSnapshotSchema.parse(json(row.review_snapshot));
      const detail = await this.loadDetail(db, row, true, true);
      if (!detail.canSubmit || !isDeepStrictEqual(detail.actions, snapshot.actions))
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '逐项收尾依据已变化，请驳回或撤回后重新核对',
        );
      const terminationId = await this.termination.recordApprovedCloseout(db, snapshot, context);
      await db.execute(
        'UPDATE production_batch_closeout SET termination_id=?,pending_approval_id=NULL,version=version+1,updated_by=? WHERE id=?',
        [terminationId, context.actorId, row.id],
      );
    });
  }

  private async lockBatch(db: PoolConnection, batchId: string): Promise<Closeout> {
    await lockWorkOrderForBatch(db, batchId);
    const batch = await findBatch(db, batchId, true);
    if (batch.status !== 'closing')
      throw new ProductionDomainError('INVALID_STATE', '批次不在收尾阶段');
    const [[row]] = await db.query<Closeout[]>(
      'SELECT * FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE',
      [batchId],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '收尾记录不存在');
    return row;
  }
  private async lockId(db: PoolConnection, closeoutId: string): Promise<Closeout> {
    const [[locator]] = await db.query<Closeout[]>(
      'SELECT production_batch_id FROM production_batch_closeout WHERE id=?',
      [closeoutId],
    );
    if (!locator) throw new ProductionDomainError('NOT_FOUND', '收尾记录不存在');
    return this.lockBatch(db, String(locator.production_batch_id));
  }
  private async current(
    db: PoolConnection,
    id: string,
    instance: string,
    version: number,
  ): Promise<Closeout> {
    const row = await this.lockId(db, id);
    if (
      row.version !== version ||
      nullableId(row.pending_approval_id) !== instance ||
      row.termination_id !== null
    )
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '收尾申请已变化或结束');
    return row;
  }
  private editable(row: Closeout, version: number): void {
    if (row.version !== version)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '收尾记录已变化，请刷新');
    if (row.pending_approval_id !== null || row.termination_id !== null)
      throw new ProductionDomainError('INVALID_STATE', '收尾已送审或结束，不能继续编辑');
  }
  private actor(context: CommandContext): void {
    if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人');
  }

  private async loadDetail(
    db: PoolConnection,
    row: Closeout,
    lock: boolean,
    forFinalApproval = false,
  ): Promise<BatchCloseoutDetail> {
    const check = await this.termination.loadCheck(db, String(row.production_batch_id), lock);
    const [actions] = await db.query<Action[]>(
      `SELECT * FROM production_batch_closeout_action WHERE closeout_id=? ORDER BY id${lock ? ' FOR SHARE' : ''}`,
      [row.id],
    );
    const output =
      row.available_quantity === null
        ? null
        : {
            availableQuantity: Number(row.available_quantity),
            additionalScrapQuantity: Number(row.additional_scrap_quantity),
            reason: row.reason,
            materialReviewNote: row.material_review_note!,
          };
    const { demands, pendingItems, allocationDemands } = await loadCloseoutItems(db, check, lock);
    const materialReviews = check.materials.map((material) => {
      const reviewed = actions
        .filter(
          (action) =>
            action.item_kind === 'material' && String(action.target_id) === material.allocationId,
        )
        .at(-1);
      return {
        allocationId: material.allocationId,
        demandId: allocationDemands.get(material.allocationId)!,
        status: !reviewed
          ? ('pending' as const)
          : isDeepStrictEqual(json(reviewed.fact_snapshot), material)
            ? ('reviewed' as const)
            : ('stale' as const),
        reason: reviewed?.reason ?? null,
        actorId: reviewed ? String(reviewed.created_by) : null,
        reviewedAt: reviewed ? toBeijingISOString(reviewed.created_at) : null,
      };
    });
    const blockers = [...check.blockers];
    if (check.impacts.length) blockers.push('逐项完成所有需求、工序及关联单据的收尾处理');
    if (!output) blockers.push('请登记并保存实际产出和物料安排');
    if (row.pending_approval_id !== null && !forFinalApproval) blockers.push('收尾审批正在进行');
    if (materialReviews.some((review) => review.status !== 'reviewed'))
      blockers.push('逐项核对物料安排；领退料或损耗变化后须重新核对');
    return {
      id: String(row.id),
      batchId: String(row.production_batch_id),
      reason: row.reason,
      version: row.version,
      approvalInstanceId: nullableId(row.approval_instance_id),
      pendingApprovalId: nullableId(row.pending_approval_id),
      output,
      demands,
      pendingItems,
      materialReviews,
      actions: actions.map((action) => {
        const fact = json(action.fact_snapshot) as {
          quantity?: string | number | null;
          unit?: string | null;
        };
        return {
          id: String(action.id),
          kind: action.item_kind,
          targetId: String(action.target_id),
          label: action.label,
          previousStatus: action.previous_status,
          resultingStatus: action.resulting_status,
          quantity:
            action.item_kind === 'material' || fact.quantity == null ? null : String(fact.quantity),
          unit: fact.unit ?? null,
          reason: action.reason,
          actorId: String(action.created_by),
          createdAt: toBeijingISOString(action.created_at),
        };
      }),
      check,
      canSubmit: blockers.length === 0,
      blockers,
    };
  }
}
