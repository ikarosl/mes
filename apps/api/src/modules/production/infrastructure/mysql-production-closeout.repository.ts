import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  BatchCloseoutDetail,
  BatchCloseoutAction,
  BeginBatchCloseoutPayload,
  HandleBatchCloseoutItemPayload,
  BatchCloseoutCommandResult,
  BatchCloseoutWithdrawalCheck,
  WithdrawBatchCloseoutPayload,
  WithdrawBatchCloseoutResult,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
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
import { loadCloseoutItems } from './mysql-production-closeout-items.js';
import { allocationNeedsCloseoutSql } from './mysql-production-material.sql.js';

import {
  CLOSEOUT_COLUMNS,
  type CloseoutRow as Closeout,
} from './mysql-production-output.persistence.js';
import {
  enterTaskCloseout,
  readTaskCloseoutEntry,
  readTaskCloseoutWithdrawalCheck,
  appendTaskCloseoutAction,
  taskStateOf,
  taskCloseoutFactOf,
  assertTaskActionVersion,
} from './mysql-production-closeout-task-actions.js';
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
        `SELECT ${CLOSEOUT_COLUMNS} FROM production_batch_closeout WHERE production_batch_id=?`,
        [batchId],
      );
      return row ? this.loadDetail(db, row, false) : null;
    });
  }

  withdrawalCheck(batchId: string): Promise<BatchCloseoutWithdrawalCheck> {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, batchId);
      const [[row]] = await db.query<Closeout[]>(
        `SELECT ${CLOSEOUT_COLUMNS} FROM production_batch_closeout WHERE production_batch_id=?`,
        [batchId],
      );
      return readTaskCloseoutWithdrawalCheck(db, batch, row ?? null);
    });
  }

  withdraw(
    batchId: string,
    payload: WithdrawBatchCloseoutPayload,
    context: CommandContext,
  ): Promise<WithdrawBatchCloseoutResult> {
    return withTransaction(this.pool, async (db) => {
      this.actor(context);
      const actorId = context.actorId!;
      await lockWorkOrderForBatch(db, batchId);
      const batch = await findBatch(db, batchId, true);
      const [[row]] = await db.query<Closeout[]>(
        `SELECT ${CLOSEOUT_COLUMNS} FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE`,
        [batchId],
      );
      if (batch.version !== payload.version || row?.version !== payload.closeoutVersion)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '任务或结案记录已变化，请刷新核对',
        );
      const check = await readTaskCloseoutWithdrawalCheck(db, batch, row ?? null, true);
      if (!check.canWithdraw || !check.restoreStatus || !row)
        throw new ProductionDomainError(
          'INVALID_STATE',
          check.blockedReason ?? '当前任务不能撤回结束',
        );
      requireBatchTransition(batch.status, check.restoreStatus);
      const reason = payload.reason.trim();
      if (!reason || reason.length > 5000)
        throw new ProductionDomainError('INVALID_INPUT', '请填写五千字以内的撤回说明');
      const entry = await readTaskCloseoutEntry(db, row, true);
      if (!entry) throw new ProductionDomainError('INVALID_STATE', '本次进入结案的行动依据已变化');
      const [changedBatch] = await db.execute<ResultSetHeader>(
        `UPDATE production_batches SET status=?,execution_completed_at=NULL,execution_completed_by=NULL,
         version=version+1,updated_by=? WHERE id=? AND version=? AND status='closing'`,
        [check.restoreStatus, actorId, batchId, payload.version],
      );
      assertTaskActionVersion(changedBatch);
      const [changedRoot] = await db.execute<ResultSetHeader>(
        `UPDATE production_batch_closeout SET review_snapshot=NULL,version=version+1,updated_by=?
         WHERE id=? AND version=? AND current_revision_id IS NULL AND pending_approval_id IS NULL`,
        [actorId, row.id, payload.closeoutVersion],
      );
      assertTaskActionVersion(changedRoot);
      const afterBatch = await findBatch(db, batchId, true);
      const afterRoot = { ...row, version: row.version + 1, review_snapshot: null };
      const withdrawalActionId = await appendTaskCloseoutAction(db, {
        closeoutId: String(row.id),
        batchId,
        actorId,
        label: '撤回任务结束',
        reason,
        fact: {
          actionType: 'withdraw',
          entryActionId: String(entry.id),
          before: taskStateOf(batch, row),
          after: taskStateOf(afterBatch, afterRoot),
        },
      });
      const result: WithdrawBatchCloseoutResult = {
        closeoutId: String(row.id),
        batchId,
        batchStatus: check.restoreStatus,
        version: afterBatch.version,
        closeoutVersion: afterRoot.version,
        entryActionId: String(entry.id),
        withdrawalActionId,
      };
      await writeInventoryAudit(
        db,
        context,
        'production-batch.closeout.withdraw',
        'production_batch',
        batchId,
        taskStateOf(batch, row),
        { ...result, reason },
      );
      return result;
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
      const entry = await enterTaskCloseout(
        db,
        batch,
        payload.closeoutVersion,
        'early',
        payload.reason.trim(),
        context.actorId!,
      );
      const result = { closeoutId: entry.closeoutId, batchId };
      await writeInventoryAudit(
        db,
        context,
        'production-batch.closeout.begin',
        'production_batch',
        batchId,
        { status: batch.status },
        {
          ...result,
          entryActionId: entry.entryActionId,
          reason: payload.reason,
          status: 'closing',
        },
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

  private async lockBatch(db: PoolConnection, batchId: string): Promise<Closeout> {
    await lockWorkOrderForBatch(db, batchId);
    const batch = await findBatch(db, batchId, true);
    if (batch.status !== 'closing')
      throw new ProductionDomainError('INVALID_STATE', '批次不在收尾阶段');
    const [[row]] = await db.query<Closeout[]>(
      `SELECT ${CLOSEOUT_COLUMNS} FROM production_batch_closeout WHERE production_batch_id=? FOR UPDATE`,
      [batchId],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '收尾记录不存在');
    return row;
  }
  private editable(row: Closeout, version: number): void {
    if (row.version !== version)
      throw new ProductionDomainError('CONCURRENT_MODIFICATION', '收尾记录已变化，请刷新');
    if (row.pending_approval_id !== null || row.current_revision_id !== null)
      throw new ProductionDomainError('INVALID_STATE', '收尾已送审或结束，不能继续编辑');
  }
  private actor(context: CommandContext): void {
    if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人');
  }

  async loadDetail(db: PoolConnection, row: Closeout, lock: boolean): Promise<BatchCloseoutDetail> {
    const check = await this.termination.loadCheck(db, String(row.production_batch_id), lock);
    const [actions] = await db.query<Action[]>(
      `SELECT * FROM production_batch_closeout_action WHERE closeout_id=? ORDER BY id${lock ? ' FOR SHARE' : ''}`,
      [row.id],
    );
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
    if (row.pending_approval_id !== null) blockers.push('收尾审批正在进行');
    if (materialReviews.some((review) => review.status !== 'reviewed'))
      blockers.push('逐项核对物料安排；领退料或损耗变化后须重新核对');
    const withdrawal = await readTaskCloseoutWithdrawalCheck(
      db,
      await findBatch(db, String(row.production_batch_id)),
      row,
      lock,
    );
    return {
      id: String(row.id),
      batchId: String(row.production_batch_id),
      reason: row.reason,
      version: row.version,
      approvalInstanceId: nullableId(row.approval_instance_id),
      pendingApprovalId: nullableId(row.pending_approval_id),
      mode: row.closeout_mode,
      currentRevisionId: nullableId(row.current_revision_id),
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
          actionType:
            action.item_kind === 'task'
              ? (taskCloseoutFactOf(action.fact_snapshot)?.actionType ?? null)
              : null,
          entryActionId:
            action.item_kind === 'task'
              ? (taskCloseoutFactOf(action.fact_snapshot)?.entryActionId ?? null)
              : null,
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
      canHandle:
        check.batchStatus === 'closing' &&
        row.pending_approval_id === null &&
        row.current_revision_id === null,
      canWithdraw: withdrawal.canWithdraw,
      withdrawBlockedReason: withdrawal.blockedReason,
      withdrawRestoredStatus: withdrawal.restoreStatus,
      blockers,
    };
  }
}
