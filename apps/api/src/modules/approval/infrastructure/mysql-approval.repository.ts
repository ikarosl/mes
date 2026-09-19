import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type { ApprovalSubmission } from '../application/approval-submission.js';
import type {
  ApprovalActionType,
  ApprovalCommentCommand,
  ApprovalDecisionCommand,
  ApprovalInstanceDetail,
  ApprovalInstanceListItem,
  ApprovalInstanceQuery,
  ApprovalStepStatus,
  ApprovalSubjectType,
  PageResult,
} from '@company/contracts';
import { IdentityDirectoryService } from '../../identity/public.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeApprovalAudit } from './approval-audit.js';
import { MysqlApprovalFlowRepository } from './mysql-approval-flow.repository.js';
import type { FlowStepRow } from './mysql-approval-flow.repository.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ApprovalDomainError } from '../domain/approval.errors.js';
import { ApprovalSubjectHandlerRegistry } from '../application/approval-subject-handler.registry.js';
import { ApprovalRepository } from '../application/ports/approval.repository.js';
import {
  assertInstanceAssigneeRule,
  resolveAssigneeIds,
  resolveBusinessAssigneeUsers,
  type InstanceAssigneeRuleRow,
} from './approval-assignees.js';
import { ApprovalNotifications } from './approval-notifications.js';

type Db = Pool | PoolConnection;
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

interface InstanceRow extends RowDataPacket {
  id: number;
  instance_no: string;
  scene_code: string;
  subject_type: ApprovalSubjectType;
  subject_id: number;
  flow_version_id: number;
  flow_version_no: number;
  title: string;
  subject_version: number;
  snapshot_schema_version: number;
  subject_snapshot: string | object;
  status: ApprovalStatus;
  created_by: number;
  applicant_name: string;
  created_at: Date;
  ended_at: Date | null;
  version: number;
}

interface InstanceStepRow extends RowDataPacket, InstanceAssigneeRuleRow {
  id: number;
  instance_id: number;
  flow_step_id: number;
  step_no: number;
  name: string;
  status: ApprovalStepStatus;
  activated_at: Date | null;
  ended_at: Date | null;
  version: number;
}

interface ActionRow extends RowDataPacket {
  id: number;
  action_no: number;
  action_type: ApprovalActionType;
  instance_step_id: number | null;
  actor_id: number;
  actor_name: string;
  comment: string | null;
  created_at: Date;
}

@Injectable()
export class MysqlApprovalRepository extends ApprovalRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly identity: IdentityDirectoryService,
    private readonly handlers: ApprovalSubjectHandlerRegistry,
    private readonly flows: MysqlApprovalFlowRepository,
    private readonly notifications: ApprovalNotifications,
  ) {
    super();
  }

  async listInstances(
    query: ApprovalInstanceQuery,
    actorId: string,
    canViewAll: boolean,
  ): Promise<PageResult<ApprovalInstanceListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const scope = query.scope ?? 'todo';
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    if (query.status) {
      conditions.push('i.status=?');
      parameters.push(query.status);
    }
    if (query.subjectId) {
      conditions.push('i.subject_id=?');
      parameters.push(query.subjectId);
    }
    if (scope === 'todo') {
      const current = await this.currentEligibilityCondition(actorId);
      conditions.push(current.sql);
      parameters.push(...current.parameters);
    } else if (scope === 'mine') {
      conditions.push('i.created_by=?');
      parameters.push(actorId);
    } else if (!canViewAll) {
      const current = await this.currentEligibilityCondition(actorId);
      conditions.push(`(i.created_by=? OR EXISTS (SELECT 1 FROM approval_actions a
        WHERE a.instance_id=i.id AND a.created_by=? AND a.action_type IN ('approved','rejected'))
        OR (${current.sql}))`);
      parameters.push(actorId, actorId, ...current.parameters);
    }
    const where = conditions.length ? conditions.join(' AND ') : '1=1';
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM approval_instances i WHERE ${where}`,
      parameters,
    );
    const [rows] = await this.pool.query<InstanceRow[]>(
      `SELECT i.id,i.instance_no,i.scene_code,i.subject_type,i.subject_id,i.flow_version_id,
       i.title,i.subject_version,i.snapshot_schema_version,i.subject_snapshot,i.status,
       i.created_by,i.created_at,i.ended_at,i.version
       FROM approval_instances i WHERE ${where} ORDER BY i.created_at DESC,i.id DESC LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const names = new Map(
      (await this.identity.listUserReferencesByIds(rows.map((r) => String(r.created_by)))).map(
        (u) => [u.id, u.displayName],
      ),
    );
    const items: ApprovalInstanceListItem[] = [];
    for (const row of rows) {
      const steps = await this.instanceSteps(this.pool, String(row.id));
      const current = steps.find((s) => s.status === 'pending');
      const blocked = current
        ? (await resolveAssigneeIds(this.identity, current)).length === 0
        : false;
      items.push(
        this.instanceListItem(
          row,
          names.get(String(row.created_by)) ?? String(row.created_by),
          current?.name ?? null,
          blocked,
        ),
      );
    }
    return { items, total: Number(count?.total ?? 0), page, pageSize };
  }

  async getInstance(
    id: string,
    actorId: string,
    canViewAll: boolean,
  ): Promise<ApprovalInstanceDetail> {
    return withTransaction(this.pool, async (connection) => {
      const [[instance]] = await connection.query<InstanceRow[]>(
        `SELECT i.id,i.instance_no,i.scene_code,i.subject_type,i.subject_id,i.flow_version_id,
         v.version_no flow_version_no,i.title,i.subject_version,i.snapshot_schema_version,
         i.subject_snapshot,i.status,i.created_by,i.created_at,i.ended_at,i.version
         FROM approval_instances i JOIN approval_flow_versions v ON v.id=i.flow_version_id WHERE i.id=?`,
        [id],
      );
      if (!instance) throw new ApprovalDomainError('NOT_FOUND', '审批申请不存在');
      if (!canViewAll && String(instance.created_by) !== actorId) {
        const current = await this.currentEligibilityCondition(actorId);
        const [[participation]] = await connection.query<(RowDataPacket & { id: string })[]>(
          `SELECT i.id FROM approval_instances i WHERE i.id=? AND (
            EXISTS (SELECT 1 FROM approval_actions a WHERE a.instance_id=i.id
              AND a.created_by=? AND a.action_type IN ('approved','rejected'))
            OR (${current.sql}))`,
          [id, actorId, ...current.parameters],
        );
        if (!participation) throw new ApprovalDomainError('FORBIDDEN', '没有查看该审批申请的权限');
      }
      return this.mapInstanceDetail(connection, instance, actorId);
    });
  }

  /**
   * 通用提交事务：业务 handler 校验受审内容，Approval 固定流程并建申请，再由 handler 绑定。
   * handler 内同一连接池上的嵌套 withTransaction 通过事务上下文复用连接；
   * 产品冻结、审批记录和成功审计一起提交，任一步失败均向外抛错并整体回滚。
   */
  async submit(
    command: ApprovalSubmission,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail> {
    this.requireActor(audit);
    const { sceneCode, subjectId, expectedVersion } = command;
    const scene = this.handlers.getSceneDefinition(sceneCode);
    const handler = this.handlers.getHandler(scene.code, scene.subjectType);
    const instanceId = await withTransaction(this.pool, async (connection) => {
      // 先锁业务根并取得送审快照；后续审批操作也按业务根 → 申请的顺序加锁。
      const preparation = await handler.prepareForApproval(subjectId, expectedVersion, audit);
      const { flow, steps } = await this.flows.lockPublishedFlow(connection, scene.code);
      const resolvedUsers = resolveBusinessAssigneeUsers(
        scene,
        preparation.businessAssigneeResolutions,
        steps,
      );
      const resolvedSteps = steps.map((step) => ({
        ...step,
        resolved_assignee_user_id:
          step.assignee_type === 'business' ? resolvedUsers.get(step.assignee_source_code!)! : null,
      }));
      // 业务节点固定送审时身份；所有节点仍实时检查资格，角色不冻结候选名单。
      const candidates = await this.resolveCandidates(resolvedSteps);
      const instanceNo = this.newInstanceNo();
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO approval_instances
          (instance_no,scene_code,subject_type,subject_id,flow_version_id,title,subject_version,
           snapshot_schema_version,subject_snapshot,policy_snapshot,status,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)`,
        [
          instanceNo,
          scene.code,
          scene.subjectType,
          subjectId,
          flow.id,
          preparation.title,
          preparation.subjectVersion,
          preparation.snapshotSchemaVersion,
          JSON.stringify(preparation.snapshot),
          JSON.stringify({
            approvalMode: 'any',
            allowSelfReview: true,
            allowCrossStepSameUser: true,
          }),
          audit.actorId,
        ],
      );
      const instanceId = String(insert.insertId);
      for (const step of resolvedSteps) {
        const isFirst = step.step_no === 1;
        await connection.execute(
          `INSERT INTO approval_instance_steps
             (instance_id,flow_step_id,step_no,resolved_assignee_user_id,status,activated_at,created_by)
           VALUES (?,?,?,?,?,?,?)`,
          [
            insert.insertId,
            step.id,
            step.step_no,
            step.resolved_assignee_user_id,
            isFirst ? 'pending' : 'waiting',
            isFirst ? new Date() : null,
            audit.actorId,
          ],
        );
      }
      // 绑定后的业务版本由所有者返回，审批引擎不假设业务版本一定加一。
      const boundVersion = await handler.bindApproval(
        subjectId,
        instanceId,
        preparation.subjectVersion,
        audit,
      );
      if (!Number.isInteger(boundVersion) || boundVersion < 0 || boundVersion > 2_147_483_647) {
        throw new ApprovalDomainError('CONFLICT', '业务处理器返回的冻结版本无效');
      }
      await connection.execute('UPDATE approval_instances SET subject_version=? WHERE id=?', [
        boundVersion,
        instanceId,
      ]);
      const actionId = await this.insertAction(connection, {
        instanceId,
        actionNo: 1,
        stepId: null,
        type: 'submitted',
        comment: null,
        details: { flowVersionNo: flow.version_no, subjectVersion: boundVersion },
        actorId: audit.actorId!,
      });
      const firstStep = (await this.instanceSteps(connection, instanceId)).find(
        (step) => step.step_no === 1,
      )!;
      await this.notifications.publish(
        {
          actionId,
          instanceId,
          instanceTitle: preparation.title,
          eventType: 'approval_task_assigned',
          recipientIds: candidates.get(1)!,
          stepId: String(firstStep.id),
          stepName: firstStep.name,
        },
        audit,
      );
      await writeApprovalAudit(connection, audit, 'approval.submit', String(insert.insertId), {
        sceneCode: scene.code,
        subjectId,
      });
      return instanceId;
    });
    return this.getInstance(instanceId, audit.actorId!, false);
  }

  async approve(
    id: string,
    command: ApprovalDecisionCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail> {
    return this.decide(id, command, audit, 'approved');
  }

  async reject(
    id: string,
    command: ApprovalDecisionCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail> {
    if (!command.comment?.trim())
      throw new ApprovalDomainError('INVALID_INPUT', '驳回必须填写意见');
    return this.decide(id, command, audit, 'rejected');
  }

  /** 仅申请人可撤回：关闭未完成节点和待办，恢复业务草稿；已产生的审批证据保留。 */
  async withdraw(
    id: string,
    command: ApprovalCommentCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail> {
    this.requireActor(audit);
    await withTransaction(this.pool, async (connection) => {
      const instance = await this.lockInstance(connection, id);
      if (instance.status !== 'pending')
        throw new ApprovalDomainError('INVALID_STATE', '已结束的审批不能撤回');
      if (String(instance.created_by) !== audit.actorId)
        throw new ApprovalDomainError('FORBIDDEN', '只有申请人可以撤回审批');
      this.assertInstanceVersion(instance, command.version);
      const currentStep = (await this.instanceSteps(connection, id, true)).find(
        (step) => step.status === 'pending',
      );
      const recipientIds = currentStep ? await resolveAssigneeIds(this.identity, currentStep) : [];
      await connection.execute(
        `UPDATE approval_instance_steps
            SET status='cancelled',ended_at=NOW(),updated_by=?,version=version+1
          WHERE instance_id=? AND status IN ('waiting','pending')`,
        [audit.actorId, instance.id],
      );
      await this.handlers
        .getHandler(instance.scene_code, instance.subject_type)
        .restoreAfterApprovalEnd(
          String(instance.subject_id),
          String(instance.id),
          Number(instance.subject_version),
          audit,
        );
      await connection.execute(
        `UPDATE approval_instances SET status='withdrawn',ended_at=NOW(),updated_by=?,version=version+1
          WHERE id=? AND status='pending' AND version=?`,
        [audit.actorId, instance.id, command.version],
      );
      const actionId = await this.insertAction(connection, {
        instanceId: String(instance.id),
        actionNo: await this.nextActionNo(connection, instance.id),
        stepId: null,
        type: 'withdrawn',
        comment: command.comment?.trim() || null,
        details: null,
        actorId: audit.actorId!,
      });
      await this.notifications.publish(
        {
          actionId,
          instanceId: id,
          instanceTitle: instance.title,
          eventType: 'approval_withdrawn',
          recipientIds,
        },
        audit,
      );
      await writeApprovalAudit(connection, audit, 'approval.withdraw', String(instance.id), {
        status: 'withdrawn',
      });
    });
    return this.getInstance(id, audit.actorId!, false);
  }

  /** 锁定申请和当前节点后核对实时资格，任一人决定只推进一次。 */
  private async decide(
    id: string,
    command: ApprovalDecisionCommand,
    audit: CommandContext,
    decision: 'approved' | 'rejected',
  ): Promise<ApprovalInstanceDetail> {
    this.requireActor(audit);
    await withTransaction(this.pool, async (connection) => {
      const instance = await this.lockInstance(connection, id);
      this.assertInstanceVersion(instance, command.version);
      if (instance.status !== 'pending')
        throw new ApprovalDomainError('INVALID_STATE', '该申请已经结束');
      const steps = await this.instanceSteps(connection, id, true);
      const step = steps.find((row) => row.status === 'pending');
      if (!step || String(step.id) !== command.stepId)
        throw new ApprovalDomainError('CONFLICT', '当前审批节点已变化，请刷新后重试');
      const eligible = await resolveAssigneeIds(this.identity, step);
      if (!eligible.includes(audit.actorId!))
        throw new ApprovalDomainError('FORBIDDEN', '当前账号已不具备该节点的审批资格');
      await connection.execute(
        `UPDATE approval_instance_steps SET status=?,ended_at=NOW(),updated_by=?,version=version+1 WHERE id=?`,
        [decision, audit.actorId, step.id],
      );
      const actionId = await this.insertAction(connection, {
        instanceId: id,
        actionNo: await this.nextActionNo(connection, instance.id),
        stepId: String(step.id),
        type: decision,
        comment: command.comment?.trim() || null,
        details: {
          stepNo: step.step_no,
          assigneeType: step.assignee_type,
          roleId: step.role_id === null ? null : String(step.role_id),
          assigneeUserId: step.assignee_user_id === null ? null : String(step.assignee_user_id),
          assigneeSourceCode: step.assignee_source_code,
          resolvedAssigneeUserId:
            step.resolved_assignee_user_id === null ? null : String(step.resolved_assignee_user_id),
        },
        actorId: audit.actorId!,
      });
      const handler = this.handlers.getHandler(instance.scene_code, instance.subject_type);
      // 驳回终止整次申请；恢复业务草稿与结束申请同事务，修改后需创建新申请。
      if (decision === 'rejected') {
        await connection.execute(
          `UPDATE approval_instance_steps SET status='cancelled',ended_at=NOW(),updated_by=?,version=version+1
           WHERE instance_id=? AND status='waiting'`,
          [audit.actorId, id],
        );
        await handler.restoreAfterApprovalEnd(
          String(instance.subject_id),
          id,
          Number(instance.subject_version),
          audit,
        );
        await this.endInstance(connection, instance, 'rejected', audit);
        await this.notifications.publish(
          {
            actionId,
            instanceId: id,
            instanceTitle: instance.title,
            eventType: 'approval_rejected',
            recipientIds: [String(instance.created_by)],
          },
          audit,
        );
      } else {
        const next = steps.find((row) => row.step_no === step.step_no + 1);
        if (!next) {
          // 仅末级通过才调用业务最终生效；BOM 校验或锁定失败，本次审批决定也回滚。
          await handler.finalizeApproval(
            String(instance.subject_id),
            id,
            Number(instance.subject_version),
            audit,
          );
          await this.endInstance(connection, instance, 'approved', audit);
          await this.notifications.publish(
            {
              actionId,
              instanceId: id,
              instanceTitle: instance.title,
              eventType: 'approval_approved',
              recipientIds: [String(instance.created_by)],
            },
            audit,
          );
        } else {
          // 当前节点始终保持待处理；无人可审仅派生显示阻塞，恢复资格后自然可继续。
          await connection.execute(
            `UPDATE approval_instance_steps SET status='pending',activated_at=NOW(),updated_by=?,version=version+1 WHERE id=? AND status='waiting'`,
            [audit.actorId, next.id],
          );
          await connection.execute(
            'UPDATE approval_instances SET version=version+1,updated_by=? WHERE id=? AND version=?',
            [audit.actorId, id, command.version],
          );
          await this.notifications.publish(
            {
              actionId,
              instanceId: id,
              instanceTitle: instance.title,
              eventType: 'approval_task_assigned',
              recipientIds: await resolveAssigneeIds(this.identity, next),
              stepId: String(next.id),
              stepName: next.name,
            },
            audit,
          );
        }
      }
      await writeApprovalAudit(connection, audit, `approval.${decision}`, id, {
        stepNo: step.step_no,
        stepId: command.stepId,
        comment: command.comment ?? null,
      });
    });
    return this.getInstance(id, audit.actorId!, false);
  }

  private async endInstance(
    connection: PoolConnection,
    instance: InstanceRow,
    status: 'approved' | 'rejected',
    audit: CommandContext,
  ): Promise<void> {
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE approval_instances SET status=?,ended_at=NOW(),updated_by=?,version=version+1 WHERE id=? AND status='pending' AND version=?`,
      [status, audit.actorId, instance.id, instance.version],
    );
    if (result.affectedRows !== 1)
      throw new ApprovalDomainError('CONCURRENT_MODIFICATION', '审批申请已变化');
  }

  /**
   * 先只读定位场景和业务对象，经 handler 锁业务根并校验申请引用、冻结版本，再锁申请。
   * 与提交保持同一加锁顺序；最初的只读结果只用于定位，不能代替锁后的状态与权限校验。
   */
  private async lockInstance(connection: PoolConnection, id: string): Promise<InstanceRow> {
    const sql = `SELECT id,instance_no,scene_code,subject_type,subject_id,flow_version_id,title,
      subject_version,snapshot_schema_version,subject_snapshot,status,created_by,created_at,ended_at,version
      FROM approval_instances WHERE id=?`;
    const [[locator]] = await connection.query<InstanceRow[]>(sql, [id]);
    if (!locator) throw new ApprovalDomainError('NOT_FOUND', '审批申请不存在');
    await this.handlers
      .getHandler(locator.scene_code, locator.subject_type)
      .lockCurrentApproval(String(locator.subject_id), id, Number(locator.subject_version));
    const [[instance]] = await connection.query<InstanceRow[]>(`${sql} FOR UPDATE`, [id]);
    if (
      !instance ||
      instance.status !== 'pending' ||
      String(instance.subject_id) !== String(locator.subject_id)
    ) {
      throw new ApprovalDomainError('CONFLICT', '审批申请已结束或发生变化');
    }
    return instance;
  }

  private async instanceSteps(db: Db, id: string, lock = false): Promise<InstanceStepRow[]> {
    const [steps] = await db.query<InstanceStepRow[]>(
      `SELECT s.id,s.instance_id,s.flow_step_id,s.step_no,fs.name,fs.assignee_type,fs.role_id,fs.assignee_user_id,fs.assignee_source_code,s.resolved_assignee_user_id,s.status,
       s.activated_at,s.ended_at,s.version
       FROM approval_instance_steps s JOIN approval_flow_steps fs ON fs.id=s.flow_step_id
       WHERE s.instance_id=? ORDER BY s.step_no${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    for (const step of steps) assertInstanceAssigneeRule(step);
    return steps;
  }

  /** 身份条件在分页前过滤，读取与命令均由服务端获得实时资格。 */
  private async currentEligibilityCondition(
    actorId: string,
  ): Promise<{ sql: string; parameters: unknown[] }> {
    const eligibility = await this.identity.getApprovalActorEligibility(actorId);
    if (!eligibility.canDecide) return { sql: '0=1', parameters: [] };
    const alternatives = [
      "(fs.assignee_type='user' AND fs.assignee_user_id=?)",
      "(fs.assignee_type='business' AND s.resolved_assignee_user_id=?)",
    ];
    const parameters: unknown[] = [actorId, actorId];
    if (eligibility.roleIds.length) {
      alternatives.push("(fs.assignee_type='role' AND fs.role_id IN (?))");
      parameters.push(eligibility.roleIds);
    }
    return {
      sql: `i.status='pending' AND EXISTS (SELECT 1 FROM approval_instance_steps s
        JOIN approval_flow_steps fs ON fs.id=s.flow_step_id
        WHERE s.instance_id=i.id AND s.status='pending' AND (${alternatives.join(' OR ')}))`,
      parameters,
    };
  }

  private instanceListItem(
    row: InstanceRow,
    applicantName: string,
    currentStepName: string | null,
    blocked: boolean,
  ): ApprovalInstanceListItem {
    return {
      id: String(row.id),
      instanceNo: row.instance_no,
      sceneCode: row.scene_code,
      title: row.title,
      subjectId: String(row.subject_id),
      status: row.status,
      applicantId: String(row.created_by),
      applicantName,
      currentStepName,
      blocked,
      createdAt: this.date(row.created_at),
      endedAt: this.date(row.ended_at),
      version: Number(row.version),
    };
  }

  private async mapInstanceDetail(
    db: Db,
    instance: InstanceRow,
    actorId: string,
  ): Promise<ApprovalInstanceDetail> {
    const steps = await this.instanceSteps(db, String(instance.id));
    const [actions] = await db.query<ActionRow[]>(
      `SELECT id,action_no,action_type,instance_step_id,created_by actor_id,comment,created_at
       FROM approval_actions WHERE instance_id=? ORDER BY action_no`,
      [instance.id],
    );
    const current = steps.find((s) => s.status === 'pending');
    const eligibleIds = current ? await resolveAssigneeIds(this.identity, current) : [];
    const blocked = Boolean(current && eligibleIds.length === 0);
    const canApprove =
      instance.status === 'pending' && Boolean(current) && eligibleIds.includes(actorId);
    const userIds = [
      ...new Set([
        String(instance.created_by),
        ...steps.flatMap((s) => (s.assignee_user_id === null ? [] : [String(s.assignee_user_id)])),
        ...steps.flatMap((s) =>
          s.resolved_assignee_user_id === null ? [] : [String(s.resolved_assignee_user_id)],
        ),
        ...eligibleIds,
        ...actions.map((a) => String(a.actor_id)),
      ]),
    ];
    const users = new Map(
      (await this.identity.listUserReferencesByIds(userIds)).map((u) => [u.id, u.displayName]),
    );
    const roles = new Map(
      (
        await this.identity.listRoleReferencesByIds(
          steps.flatMap((s) => (s.role_id === null ? [] : [String(s.role_id)])),
        )
      ).map((r) => [r.id, r.name]),
    );
    // 证据结构及当前展示引用由场景所有者解释，通用仓储不读取 BOM 的 materials 等字段。
    const scene = this.handlers.getSceneDefinition(instance.scene_code);
    const subjectDisplay = await this.handlers
      .getHandler(instance.scene_code, instance.subject_type)
      .readSnapshotForDisplay(
        this.snapshotData(instance),
        Number(instance.snapshot_schema_version),
      );
    return {
      ...this.instanceListItem(
        instance,
        users.get(String(instance.created_by)) ?? String(instance.created_by),
        current?.name ?? null,
        blocked,
      ),
      subjectType: instance.subject_type,
      flowVersionNo: Number(instance.flow_version_no),
      snapshotSchemaVersion: Number(instance.snapshot_schema_version),
      ...subjectDisplay,
      steps: steps.map((step) => ({
        id: String(step.id),
        stepNo: Number(step.step_no),
        name: step.name,
        assigneeType: step.assignee_type,
        assigneeSourceCode: step.assignee_source_code,
        assigneeSourceName:
          step.assignee_source_code === null
            ? null
            : (scene.businessAssigneeSources.find(
                (source) => source.code === step.assignee_source_code,
              )?.name ?? step.assignee_source_code),
        resolvedAssigneeUserId:
          step.resolved_assignee_user_id === null ? null : String(step.resolved_assignee_user_id),
        resolvedAssigneeUserName:
          step.resolved_assignee_user_id === null
            ? null
            : (users.get(String(step.resolved_assignee_user_id)) ??
              String(step.resolved_assignee_user_id)),
        roleId: step.role_id === null ? null : String(step.role_id),
        roleName:
          step.role_id === null ? null : (roles.get(String(step.role_id)) ?? String(step.role_id)),
        assigneeUserId: step.assignee_user_id === null ? null : String(step.assignee_user_id),
        assigneeUserName:
          step.assignee_user_id === null
            ? null
            : (users.get(String(step.assignee_user_id)) ?? String(step.assignee_user_id)),
        status: step.id === current?.id && blocked ? 'blocked' : step.status,
        blockedReason: step.id === current?.id && blocked ? 'no_eligible_assignee' : null,
        activatedAt: this.date(step.activated_at),
        endedAt: this.date(step.ended_at),
        eligibleUsers:
          step.id === current?.id
            ? eligibleIds.map((id) => ({ id, displayName: users.get(id) ?? id }))
            : [],
      })),
      actions: actions.map((action) => ({
        id: String(action.id),
        actionNo: Number(action.action_no),
        actionType: action.action_type,
        stepId: action.instance_step_id === null ? null : String(action.instance_step_id),
        actorId: String(action.actor_id),
        actorName: users.get(String(action.actor_id)) ?? String(action.actor_id),
        comment: action.comment,
        createdAt: this.date(action.created_at),
      })),
      currentStepId: current ? String(current.id) : null,
      canApprove,
      canWithdraw: instance.status === 'pending' && String(instance.created_by) === actorId,
    };
  }

  /** 这里只解码 JSON；字段结构和证据版本是否可读交给业务 handler。 */
  private snapshotData(instance: InstanceRow): unknown {
    try {
      return typeof instance.subject_snapshot === 'string'
        ? JSON.parse(instance.subject_snapshot)
        : instance.subject_snapshot;
    } catch {
      throw new ApprovalDomainError('CONFLICT', '审批证据 JSON 无法读取');
    }
  }

  /** 提交前逐级检查当前合格人员；这里只解析用户 ID，不创建或分派任务。 */
  private async resolveCandidates(
    steps: (FlowStepRow & InstanceAssigneeRuleRow)[],
  ): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();
    for (const step of steps) {
      assertInstanceAssigneeRule(step);
      const candidates = await resolveAssigneeIds(this.identity, step);
      if (!candidates.length)
        throw new ApprovalDomainError(
          'NO_ELIGIBLE_ASSIGNEE',
          `节点“${step.name}”当前没有合格审批人`,
        );
      result.set(Number(step.step_no), candidates);
    }
    return result;
  }

  private assertInstanceVersion(instance: InstanceRow, version: number): void {
    if (Number(instance.version) !== version)
      throw new ApprovalDomainError('CONCURRENT_MODIFICATION', '审批信息已变化，请刷新后重试');
  }
  private requireActor(audit: CommandContext): void {
    if (!audit.actorId) throw new ApprovalDomainError('FORBIDDEN', '缺少当前操作人');
  }
  private newInstanceNo(): string {
    return `AP-${randomUUID()}`;
  }
  private async nextActionNo(db: Db, instanceId: string | number): Promise<number> {
    const [[row]] = await db.query<(RowDataPacket & { value: number })[]>(
      'SELECT COALESCE(MAX(action_no),0)+1 value FROM approval_actions WHERE instance_id=?',
      [instanceId],
    );
    return Number(row!.value);
  }
  private async insertAction(
    db: Db,
    action: {
      instanceId: string;
      actionNo: number;
      stepId: string | null;
      type: ApprovalActionType;
      comment: string | null;
      details: Record<string, unknown> | null;
      actorId: string;
    },
  ): Promise<string> {
    await db.execute(
      `INSERT INTO approval_actions (instance_id,action_no,instance_step_id,action_type,comment,details,created_by) VALUES (?,?,?,?,?,?,?)`,
      [
        action.instanceId,
        action.actionNo,
        action.stepId,
        action.type,
        action.comment,
        action.details ? JSON.stringify(action.details) : null,
        action.actorId,
      ],
    );
    const [[row]] = await db.query<(RowDataPacket & { id: string })[]>(
      'SELECT CAST(LAST_INSERT_ID() AS CHAR) id',
    );
    return row!.id;
  }
  private date(value: Date): string;
  private date(value: Date | null): string | null;
  private date(value: Date | null): string | null {
    return value ? toBeijingISOString(value) : null;
  }
}
