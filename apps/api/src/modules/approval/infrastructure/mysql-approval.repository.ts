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
  ApprovalTaskItem,
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

interface InstanceStepRow extends RowDataPacket {
  id: number;
  instance_id: number;
  flow_step_id: number;
  step_no: number;
  name: string;
  role_id: number;
  status: ApprovalStepStatus;
  assignment_round: number;
  blocked_reason: 'no_eligible_assignee' | null;
  activated_at: Date | null;
  ended_at: Date | null;
  version: number;
}

interface TaskRow extends RowDataPacket {
  id: number;
  instance_step_id: number;
  assignee_id: number;
  assignee_name: string;
  assignment_round: number;
  status: ApprovalTaskItem['status'];
  close_reason: ApprovalTaskItem['closeReason'];
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
      const roleIds: string[] = [];
      for (const role of await this.identity.listApprovalRoleOptions()) {
        if ((await this.identity.listApprovalEligibleUserIds(role.id)).includes(actorId))
          roleIds.push(role.id);
      }
      conditions.push(
        roleIds.length
          ? `i.status='pending' AND EXISTS (
        SELECT 1 FROM approval_tasks t JOIN approval_instance_steps s ON s.id=t.instance_step_id
        JOIN approval_flow_steps fs ON fs.id=s.flow_step_id
        WHERE s.instance_id=i.id AND s.status='pending' AND t.status='pending'
          AND t.assignment_round=s.assignment_round AND t.assignee_id=? AND fs.role_id IN (?))`
          : '0=1',
      );
      if (roleIds.length) parameters.push(actorId, roleIds);
    } else if (scope === 'mine') {
      conditions.push('i.created_by=?');
      parameters.push(actorId);
    } else if (!canViewAll) {
      conditions.push(`(i.created_by=? OR EXISTS (SELECT 1 FROM approval_tasks t
        JOIN approval_instance_steps s ON s.id=t.instance_step_id WHERE s.instance_id=i.id AND t.assignee_id=?))`);
      parameters.push(actorId, actorId);
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
      const current = steps.find((s) => s.status === 'pending' || s.status === 'blocked');
      const blocked = current ? await this.stepHasNoAssignee(this.pool, current) : false;
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
    canReassign = false,
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
        const [[participation]] = await connection.query<(RowDataPacket & { id: string })[]>(
          `SELECT t.id FROM approval_tasks t JOIN approval_instance_steps s ON s.id=t.instance_step_id
           WHERE s.instance_id=? AND t.assignee_id=? LIMIT 1`,
          [id, actorId],
        );
        if (!participation) throw new ApprovalDomainError('FORBIDDEN', '没有查看该审批申请的权限');
      }
      return this.mapInstanceDetail(connection, instance, actorId, canReassign);
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
      // 提交时检查每一级均有人可审，但只为首级生成待办；后续级激活时重新解析人员。
      const candidates = await this.resolveCandidates(steps);
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
      for (const step of steps) {
        const isFirst = step.step_no === 1;
        const [stepInsert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO approval_instance_steps
             (instance_id,flow_step_id,step_no,status,assignment_round,activated_at,created_by)
           VALUES (?,?,?,?,?,?,?)`,
          [
            insert.insertId,
            step.id,
            step.step_no,
            isFirst ? 'pending' : 'waiting',
            isFirst ? 1 : 0,
            isFirst ? new Date() : null,
            audit.actorId,
          ],
        );
        if (isFirst) {
          await this.createTasks(
            connection,
            stepInsert.insertId,
            1,
            candidates.get(step.step_no) ?? [],
            audit,
          );
        }
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
      await this.insertAction(connection, {
        instanceId,
        actionNo: 1,
        stepId: null,
        taskId: null,
        type: 'submitted',
        comment: null,
        details: { flowVersionNo: flow.version_no, subjectVersion: boundVersion },
        actorId: audit.actorId!,
      });
      await writeApprovalAudit(connection, audit, 'approval.submit', String(insert.insertId), {
        sceneCode: scene.code,
        subjectId,
      });
      return instanceId;
    });
    return this.getInstance(instanceId, audit.actorId!, true, false);
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
      await connection.execute(
        `UPDATE approval_tasks t JOIN approval_instance_steps s ON s.id=t.instance_step_id
            SET t.status='closed',t.close_reason='instance_withdrawn',t.ended_at=NOW(),
                t.updated_by=?,t.version=t.version+1
          WHERE s.instance_id=? AND t.status='pending'`,
        [audit.actorId, instance.id],
      );
      await connection.execute(
        `UPDATE approval_instance_steps
            SET status='cancelled',blocked_reason=NULL,ended_at=NOW(),updated_by=?,version=version+1
          WHERE instance_id=? AND status IN ('waiting','pending','blocked')`,
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
      await this.insertAction(connection, {
        instanceId: String(instance.id),
        actionNo: await this.nextActionNo(connection, instance.id),
        stepId: null,
        taskId: null,
        type: 'withdrawn',
        comment: command.comment?.trim() || null,
        details: null,
        actorId: audit.actorId!,
      });
      await writeApprovalAudit(connection, audit, 'approval.withdraw', String(instance.id), {
        status: 'withdrawn',
      });
    });
    return this.getInstance(id, audit.actorId!, true, false);
  }

  /** 按当前节点的原角色重新生成候选任务；旧轮关闭留痕，无人时阻塞，不跳级。 */
  async reassign(
    id: string,
    command: ApprovalCommentCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail> {
    this.requireActor(audit);
    const reason = command.comment?.trim();
    if (!reason) throw new ApprovalDomainError('INVALID_INPUT', '重新分派必须填写原因');
    await withTransaction(this.pool, async (connection) => {
      const instance = await this.lockInstance(connection, id);
      if (instance.status !== 'pending')
        throw new ApprovalDomainError('INVALID_STATE', '已结束的审批不能重新分派');
      this.assertInstanceVersion(instance, command.version);
      const [[step]] = await connection.query<InstanceStepRow[]>(
        `SELECT s.id,s.instance_id,s.flow_step_id,s.step_no,fs.name,fs.role_id,s.status,
                s.assignment_round,s.blocked_reason,s.activated_at,s.ended_at,s.version
           FROM approval_instance_steps s
           JOIN approval_flow_steps fs ON fs.id=s.flow_step_id
          WHERE s.instance_id=? AND s.status IN ('pending','blocked') FOR UPDATE`,
        [instance.id],
      );
      if (!step) throw new ApprovalDomainError('INVALID_STATE', '当前没有可重新分派的审批节点');
      const candidates = await this.identity.listApprovalEligibleUserIds(String(step.role_id));
      await connection.execute(
        `UPDATE approval_tasks SET status='closed',close_reason='reassigned',ended_at=NOW(),
                updated_by=?,version=version+1
          WHERE instance_step_id=? AND status='pending'`,
        [audit.actorId, step.id],
      );
      const round = Number(step.assignment_round) + 1;
      await connection.execute(
        `UPDATE approval_instance_steps
            SET status=?,assignment_round=?,blocked_reason=?,activated_at=COALESCE(activated_at,NOW()),
                updated_by=?,version=version+1
          WHERE id=? AND version=?`,
        [
          candidates.length > 0 ? 'pending' : 'blocked',
          round,
          candidates.length > 0 ? null : 'no_eligible_assignee',
          audit.actorId,
          step.id,
          step.version,
        ],
      );
      await this.createTasks(connection, step.id, round, candidates, audit);
      await connection.execute(
        'UPDATE approval_instances SET version=version+1,updated_by=? WHERE id=? AND version=?',
        [audit.actorId, instance.id, command.version],
      );
      await this.insertAction(connection, {
        instanceId: String(instance.id),
        actionNo: await this.nextActionNo(connection, instance.id),
        stepId: String(step.id),
        taskId: null,
        type: 'reassigned',
        comment: reason,
        details: { assignmentRound: round, assigneeIds: candidates },
        actorId: audit.actorId!,
      });
      await writeApprovalAudit(connection, audit, 'approval.reassign', String(instance.id), {
        stepNo: step.step_no,
        assignmentRound: round,
        assigneeIds: candidates,
      });
    });
    return this.getInstance(id, audit.actorId!, true, true);
  }

  /** 通过与驳回共用的决定事务：校验本人待办和实时资格，再推进节点或结束申请。 */
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
      if (!step)
        throw new ApprovalDomainError('INVALID_STATE', '当前没有可处理节点，请检查人员分派');
      const [[task]] = await connection.query<TaskRow[]>(
        `SELECT id,instance_step_id,assignee_id,assignment_round,status,close_reason,ended_at,version
         FROM approval_tasks WHERE id=? FOR UPDATE`,
        [command.taskId],
      );
      if (
        !task ||
        String(task.instance_step_id) !== String(step.id) ||
        String(task.assignee_id) !== audit.actorId ||
        task.status !== 'pending' ||
        Number(task.assignment_round) !== Number(step.assignment_round)
      ) {
        throw new ApprovalDomainError('FORBIDDEN', '该待办不属于当前账号或已经失效');
      }
      // 被分派过不代表现在仍有资格；角色、账号及审批权限变化必须在决定时重新核对。
      const eligible = await this.identity.listApprovalEligibleUserIds(String(step.role_id));
      if (!eligible.includes(audit.actorId!))
        throw new ApprovalDomainError('FORBIDDEN', '当前账号已不具备该节点的审批资格');
      await connection.execute(
        `UPDATE approval_tasks SET status=?,ended_at=NOW(),updated_by=?,version=version+1 WHERE id=? AND status='pending'`,
        [decision, audit.actorId, task.id],
      );
      // 每级为 ANY：一人决定后关闭同级其他待办，防止同一节点被多人重复处理。
      await connection.execute(
        `UPDATE approval_tasks SET status='closed',close_reason=?,ended_at=NOW(),updated_by=?,version=version+1
         WHERE instance_step_id=? AND status='pending'`,
        [decision === 'approved' ? 'peer_decided' : 'instance_rejected', audit.actorId, step.id],
      );
      await connection.execute(
        `UPDATE approval_instance_steps SET status=?,blocked_reason=NULL,ended_at=NOW(),updated_by=?,version=version+1 WHERE id=?`,
        [decision, audit.actorId, step.id],
      );
      await this.insertAction(connection, {
        instanceId: id,
        actionNo: await this.nextActionNo(connection, instance.id),
        stepId: String(step.id),
        taskId: String(task.id),
        type: decision,
        comment: command.comment?.trim() || null,
        details: { stepNo: step.step_no, assignmentRound: step.assignment_round },
        actorId: audit.actorId!,
      });
      const handler = this.handlers.getHandler(instance.scene_code, instance.subject_type);
      // 驳回终止整次申请；恢复业务草稿与结束申请同事务，修改后需创建新申请。
      if (decision === 'rejected') {
        await connection.execute(
          `UPDATE approval_instance_steps SET status='cancelled',blocked_reason=NULL,ended_at=NOW(),updated_by=?,version=version+1
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
        } else {
          // 非末级只推进审批，不修改 Product；下一角色无人时保留申请并标记节点阻塞。
          const candidates = await this.identity.listApprovalEligibleUserIds(String(next.role_id));
          await connection.execute(
            `UPDATE approval_instance_steps SET status=?,assignment_round=1,activated_at=NOW(),blocked_reason=?,updated_by=?,version=version+1 WHERE id=? AND status='waiting'`,
            [
              candidates.length ? 'pending' : 'blocked',
              candidates.length ? null : 'no_eligible_assignee',
              audit.actorId,
              next.id,
            ],
          );
          await this.createTasks(connection, next.id, 1, candidates, audit);
          if (!candidates.length) {
            await this.insertAction(connection, {
              instanceId: id,
              actionNo: await this.nextActionNo(connection, instance.id),
              stepId: String(next.id),
              taskId: null,
              type: 'assignment_blocked',
              comment: null,
              details: { roleId: String(next.role_id), assignmentRound: 1 },
              actorId: audit.actorId!,
            });
          }
          await connection.execute(
            'UPDATE approval_instances SET version=version+1,updated_by=? WHERE id=? AND version=?',
            [audit.actorId, id, command.version],
          );
        }
      }
      await writeApprovalAudit(connection, audit, `approval.${decision}`, id, {
        stepNo: step.step_no,
        taskId: command.taskId,
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
      `SELECT s.id,s.instance_id,s.flow_step_id,s.step_no,fs.name,fs.role_id,s.status,
       s.assignment_round,s.blocked_reason,s.activated_at,s.ended_at,s.version
       FROM approval_instance_steps s JOIN approval_flow_steps fs ON fs.id=s.flow_step_id
       WHERE s.instance_id=? ORDER BY s.step_no${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    return steps;
  }

  private async stepHasNoAssignee(db: Db, step: InstanceStepRow): Promise<boolean> {
    if (step.status === 'blocked') return true;
    const candidates = new Set(
      await this.identity.listApprovalEligibleUserIds(String(step.role_id)),
    );
    const [tasks] = await db.query<(RowDataPacket & { assignee_id: string })[]>(
      `SELECT assignee_id FROM approval_tasks WHERE instance_step_id=? AND assignment_round=? AND status='pending'`,
      [step.id, step.assignment_round],
    );
    return !tasks.some((task) => candidates.has(String(task.assignee_id)));
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
    canReassign: boolean,
  ): Promise<ApprovalInstanceDetail> {
    const steps = await this.instanceSteps(db, String(instance.id));
    const [tasks] = await db.query<TaskRow[]>(
      `SELECT t.id,t.instance_step_id,t.assignee_id,t.assignment_round,t.status,t.close_reason,t.ended_at,t.version
       FROM approval_tasks t JOIN approval_instance_steps s ON s.id=t.instance_step_id
       WHERE s.instance_id=? ORDER BY s.step_no,t.assignment_round,t.id`,
      [instance.id],
    );
    const [actions] = await db.query<ActionRow[]>(
      `SELECT id,action_no,action_type,instance_step_id,created_by actor_id,comment,created_at
       FROM approval_actions WHERE instance_id=? ORDER BY action_no`,
      [instance.id],
    );
    const userIds = [
      ...new Set([
        String(instance.created_by),
        ...tasks.map((t) => String(t.assignee_id)),
        ...actions.map((a) => String(a.actor_id)),
      ]),
    ];
    const users = new Map(
      (await this.identity.listUserReferencesByIds(userIds)).map((u) => [u.id, u.displayName]),
    );
    const roles = new Map(
      (await this.identity.listRoleReferencesByIds(steps.map((s) => String(s.role_id)))).map(
        (r) => [r.id, r.name],
      ),
    );
    const current = steps.find((s) => s.status === 'pending' || s.status === 'blocked');
    const eligible = current
      ? new Set(await this.identity.listApprovalEligibleUserIds(String(current.role_id)))
      : new Set<string>();
    const currentTasks = current
      ? tasks.filter(
          (t) =>
            String(t.instance_step_id) === String(current.id) &&
            t.status === 'pending' &&
            Number(t.assignment_round) === Number(current.assignment_round),
        )
      : [];
    const blocked = Boolean(
      current &&
      (current.status === 'blocked' ||
        !currentTasks.some((t) => eligible.has(String(t.assignee_id)))),
    );
    const myTask =
      current?.status === 'pending' && eligible.has(actorId)
        ? currentTasks.find((t) => String(t.assignee_id) === actorId)
        : undefined;
    // 证据结构及当前展示引用由场景所有者解释，通用仓储不读取 BOM 的 materials 等字段。
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
        roleId: String(step.role_id),
        roleName: roles.get(String(step.role_id)) ?? String(step.role_id),
        status: step.status,
        assignmentRound: Number(step.assignment_round),
        blockedReason: step.blocked_reason,
        activatedAt: this.date(step.activated_at),
        endedAt: this.date(step.ended_at),
        tasks: tasks
          .filter((t) => String(t.instance_step_id) === String(step.id))
          .map((t) => ({
            id: String(t.id),
            assigneeId: String(t.assignee_id),
            assigneeName: users.get(String(t.assignee_id)) ?? String(t.assignee_id),
            assignmentRound: Number(t.assignment_round),
            status: t.status,
            closeReason: t.close_reason,
            endedAt: this.date(t.ended_at),
          })),
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
      myTaskId: myTask ? String(myTask.id) : null,
      canApprove: instance.status === 'pending' && Boolean(myTask),
      canWithdraw: instance.status === 'pending' && String(instance.created_by) === actorId,
      canReassign: instance.status === 'pending' && canReassign,
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

  /** 首级、下一级与重新分派共用任务写入；候选解析及节点状态由各自用例决定。 */
  private async createTasks(
    connection: PoolConnection,
    stepId: number,
    round: number,
    candidateIds: string[],
    audit: CommandContext,
  ): Promise<void> {
    for (const candidateId of candidateIds) {
      await connection.execute(
        `INSERT INTO approval_tasks (instance_step_id,assignment_round,assignee_id,created_by)
         VALUES (?,?,?,?)`,
        [stepId, round, candidateId, audit.actorId],
      );
    }
  }

  /** 提交前逐级检查当前合格人员；这里只解析用户 ID，不创建或分派任务。 */
  private async resolveCandidates(steps: FlowStepRow[]): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();
    for (const step of steps) {
      const candidates = await this.identity.listApprovalEligibleUserIds(String(step.role_id));
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
      taskId: string | null;
      type: ApprovalActionType;
      comment: string | null;
      details: Record<string, unknown> | null;
      actorId: string;
    },
  ): Promise<void> {
    await db.execute(
      `INSERT INTO approval_actions (instance_id,action_no,instance_step_id,task_id,action_type,comment,details,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [
        action.instanceId,
        action.actionNo,
        action.stepId,
        action.taskId,
        action.type,
        action.comment,
        action.details ? JSON.stringify(action.details) : null,
        action.actorId,
      ],
    );
  }
  private date(value: Date): string;
  private date(value: Date | null): string | null;
  private date(value: Date | null): string | null {
    return value ? toBeijingISOString(value) : null;
  }
}
