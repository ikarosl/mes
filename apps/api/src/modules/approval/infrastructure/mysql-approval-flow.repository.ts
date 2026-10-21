import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import type {
  ApprovalFlowDetail,
  ApprovalFlowVersion,
  ApprovalRoleOption,
  ApprovalSceneItem,
  PublishApprovalFlowCommand,
  SaveApprovalFlowDraft,
  UserOption,
} from '@company/contracts';
import { IdentityDirectoryService } from '../../identity/public.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ApprovalDomainError } from '../domain/approval.errors.js';
import { ApprovalSubjectHandlerRegistry } from '../application/approval-subject-handler.registry.js';
import type { ApprovalSceneDefinition } from '../application/approval-scenes.js';
import { ApprovalFlowRepository } from '../application/ports/approval-flow.repository.js';
import { writeApprovalAudit } from './approval-audit.js';
import {
  assertSceneAssigneeRules,
  resolveAssigneeIds,
  type AssigneeRuleRow,
} from './approval-assignees.js';

type Db = Pool | PoolConnection;
type FlowVersionStatus = 'draft' | 'published' | 'discarded';

interface DefinitionRow extends RowDataPacket {
  id: number;
  scene_code: string;
  name: string;
  published_version_id: number | null;
  version: number;
}

interface FlowVersionRow extends RowDataPacket {
  id: number;
  definition_id: number;
  version_no: number;
  status: FlowVersionStatus;
  published_at: Date | null;
  version: number;
}

export interface FlowStepRow extends RowDataPacket, AssigneeRuleRow {
  id: number;
  flow_version_id: number;
  node_code: string;
  step_no: number;
  name: string;
}

/** 配置聚合：维护场景列表、流程草稿、发布版本，以及提交时的固定选版。 */
@Injectable()
export class MysqlApprovalFlowRepository extends ApprovalFlowRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly identity: IdentityDirectoryService,
    private readonly handlers: ApprovalSubjectHandlerRegistry,
  ) {
    super();
  }

  /** 管理页查询：将代码场景定义与数据库发布状态合并，未配置的场景也返回。 */
  async listScenes(): Promise<ApprovalSceneItem[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & { scene_code: string; published_version_no: number | null })[]
    >(
      `SELECT d.scene_code,v.version_no published_version_no
         FROM approval_flow_definitions d
         LEFT JOIN approval_flow_versions v ON v.id=d.published_version_id
        WHERE d.is_deleted=0`,
    );
    const configured = new Map(rows.map((row) => [row.scene_code, row.published_version_no]));
    // 以代码目录为准；数据库只提供流程配置，不自行创造审批场景。
    return this.handlers.listSceneDefinitions().map((scene) => ({
      code: scene.code,
      module: scene.module,
      name: scene.name,
      description: scene.description,
      businessAssigneeSources: scene.businessAssigneeSources.map((source) => ({ ...source })),
      requiredFinalAssigneeSourceCode: scene.requiredFinalAssigneeSourceCode,
      configured: configured.has(scene.code) && configured.get(scene.code) !== null,
      activeFlowVersion: configured.get(scene.code) ?? null,
    }));
  }

  listRoleOptions(): Promise<ApprovalRoleOption[]> {
    return this.identity.listApprovalRoleOptions();
  }

  listUserOptions(): Promise<UserOption[]> {
    return this.identity.listApprovalUserOptions();
  }

  getFlow(sceneCode: string): Promise<ApprovalFlowDetail> {
    return this.loadFlow(this.pool, sceneCode);
  }

  /** 仅编辑草稿；锁定流程定义后核对草稿 ID 和版本，避免并发覆盖及改写发布内容。 */
  async saveFlowDraft(
    sceneCode: string,
    payload: SaveApprovalFlowDraft,
    audit: CommandContext,
  ): Promise<ApprovalFlowDetail> {
    const scene = this.handlers.getSceneDefinition(sceneCode);
    this.requireActor(audit);
    const name = payload.name.trim();
    if (!name) throw new ApprovalDomainError('INVALID_INPUT', '审批流程名称不能为空');
    if (payload.steps.length === 0 || payload.steps.length > 20)
      throw new ApprovalDomainError('INVALID_INPUT', '审批流程至少需要一级且最多支持 20 级');
    const nodeCodes = new Set<string>();
    for (const [index, step] of payload.steps.entries()) {
      if (!step.name.trim())
        throw new ApprovalDomainError('INVALID_INPUT', `第 ${index + 1} 级名称不能为空`);
      if (step.nodeCode) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(step.nodeCode) || nodeCodes.has(step.nodeCode))
          throw new ApprovalDomainError('INVALID_INPUT', '审批节点编码无效或重复');
        nodeCodes.add(step.nodeCode);
      }
    }
    assertSceneAssigneeRules(
      scene,
      payload.steps.map((step) => ({
        assignee_type: step.assigneeType,
        role_id: step.roleId,
        assignee_user_id: step.assigneeUserId,
        assignee_source_code: step.assigneeSourceCode,
      })),
    );
    const roleOptions = await this.identity.listApprovalRoleOptions();
    const roles = new Map(roleOptions.map((role) => [role.id, role]));
    const userIds = new Set((await this.identity.listApprovalUserOptions()).map((user) => user.id));
    for (const step of payload.steps) {
      if (
        (step.assigneeType === 'role' && !roles.has(step.roleId!)) ||
        (step.assigneeType === 'user' && !userIds.has(step.assigneeUserId!))
      ) {
        throw new ApprovalDomainError(
          'INVALID_INPUT',
          '审批节点包含已失效的角色或不具备审批资格的指定用户',
        );
      }
    }

    let detail: ApprovalFlowDetail;
    await withTransaction(this.pool, async (connection) => {
      let [[definition]] = await connection.query<DefinitionRow[]>(
        'SELECT id,scene_code,name,published_version_id,version FROM approval_flow_definitions WHERE scene_code=? AND is_deleted=0 FOR UPDATE',
        [sceneCode],
      );
      if (!definition) {
        const [insert] = await connection.execute<ResultSetHeader>(
          'INSERT INTO approval_flow_definitions (scene_code,name,created_by,updated_by) VALUES (?,?,?,?)',
          [sceneCode, name, audit.actorId, audit.actorId],
        );
        [[definition]] = await connection.query<DefinitionRow[]>(
          'SELECT id,scene_code,name,published_version_id,version FROM approval_flow_definitions WHERE id=? FOR UPDATE',
          [insert.insertId],
        );
      }
      if (!definition) throw new ApprovalDomainError('CONFLICT', '审批流程定义创建失败');
      const [[draft]] = await connection.query<FlowVersionRow[]>(
        `SELECT id,definition_id,version_no,status,published_at,version
           FROM approval_flow_versions WHERE definition_id=? AND status='draft' AND is_deleted=0 FOR UPDATE`,
        [definition.id],
      );
      if (payload.draftId !== null) {
        if (!draft || String(draft.id) !== payload.draftId)
          throw new ApprovalDomainError('CONCURRENT_MODIFICATION', '审批草稿已变化，请刷新后重试');
      } else if (draft) {
        throw new ApprovalDomainError('CONCURRENT_MODIFICATION', '已有审批草稿，请刷新后编辑');
      }
      let draftId: number;
      let draftVersion: number;
      if (!draft) {
        if (payload.version !== null)
          throw new ApprovalDomainError('CONCURRENT_MODIFICATION', '审批草稿不存在，请刷新后重试');
        const [[maxVersion]] = await connection.query<
          (RowDataPacket & { max_version_no: number | null })[]
        >(
          'SELECT MAX(version_no) max_version_no FROM approval_flow_versions WHERE definition_id=? FOR UPDATE',
          [definition.id],
        );
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO approval_flow_versions
             (definition_id,version_no,status,created_by,updated_by)
           VALUES (?,?,'draft',?,?)`,
          [
            definition.id,
            Number(maxVersion?.max_version_no ?? 0) + 1,
            audit.actorId,
            audit.actorId,
          ],
        );
        draftId = insert.insertId;
        draftVersion = 0;
      } else {
        if (payload.version === null || Number(draft.version) !== payload.version)
          throw new ApprovalDomainError(
            'CONCURRENT_MODIFICATION',
            '审批草稿已被其他人修改，请刷新后重试',
          );
        draftId = draft.id;
        draftVersion = Number(draft.version);
      }

      const [existingSteps] = await connection.query<FlowStepRow[]>(
        'SELECT id,flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,assignee_source_code FROM approval_flow_steps WHERE flow_version_id=? FOR UPDATE',
        [draftId],
      );
      const existing = new Map(existingSteps.map((step) => [step.node_code, step]));
      let allowedSourceCodes = new Set(existing.keys());
      if (!draft && definition.published_version_id) {
        const [source] = await connection.query<(RowDataPacket & { node_code: string })[]>(
          'SELECT node_code FROM approval_flow_steps WHERE flow_version_id=? AND is_deleted=0',
          [definition.published_version_id],
        );
        allowedSourceCodes = new Set(source.map((row) => row.node_code));
      }
      if (payload.steps.some((step) => step.nodeCode && !allowedSourceCodes.has(step.nodeCode))) {
        throw new ApprovalDomainError('INVALID_INPUT', '节点编码不属于当前草稿或其已发布来源');
      }

      await connection.execute(
        `UPDATE approval_flow_steps
            SET is_deleted=1,deleted_by=?,deleted_at=NOW(),updated_by=?,version=version+1
          WHERE flow_version_id=? AND is_deleted=0`,
        [audit.actorId, audit.actorId, draftId],
      );
      for (const [index, item] of payload.steps.entries()) {
        const nodeCode = item.nodeCode ?? this.newNodeCode(existing);
        const old = existing.get(nodeCode);
        if (old) {
          await connection.execute(
            `UPDATE approval_flow_steps
                SET step_no=?,name=?,assignee_type=?,role_id=?,assignee_user_id=?,assignee_source_code=?,is_deleted=0,deleted_by=NULL,deleted_at=NULL,
                    updated_by=?,version=version+1
              WHERE id=? AND flow_version_id=?`,
            [
              index + 1,
              item.name.trim(),
              item.assigneeType,
              item.roleId,
              item.assigneeUserId,
              item.assigneeSourceCode,
              audit.actorId,
              old.id,
              draftId,
            ],
          );
        } else {
          await connection.execute(
            `INSERT INTO approval_flow_steps
              (flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,assignee_source_code,created_by,updated_by)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [
              draftId,
              nodeCode,
              index + 1,
              item.name.trim(),
              item.assigneeType,
              item.roleId,
              item.assigneeUserId,
              item.assigneeSourceCode,
              audit.actorId,
              audit.actorId,
            ],
          );
        }
      }
      const [updated] = await connection.execute<ResultSetHeader>(
        `UPDATE approval_flow_versions SET version=version+1,updated_by=?
          WHERE id=? AND status='draft' AND version=?`,
        [audit.actorId, draftId, draftVersion],
      );
      if (updated.affectedRows !== 1)
        throw new ApprovalDomainError(
          'CONCURRENT_MODIFICATION',
          '审批草稿已被其他人修改，请刷新后重试',
        );
      await connection.execute(
        'UPDATE approval_flow_definitions SET name=?,version=version+1,updated_by=? WHERE id=?',
        [name, audit.actorId, definition.id],
      );
      await writeApprovalAudit(connection, audit, 'approval.flow.draft', String(definition.id), {
        sceneCode,
        version: draftVersion + 1,
      });
      detail = await this.loadFlow(connection, sceneCode);
    });
    return detail!;
  }

  /** 校验各级分配规则与当前候选人后发布；新申请使用新版，在途申请仍沿用旧版。 */
  async publishFlow(
    sceneCode: string,
    command: PublishApprovalFlowCommand,
    audit: CommandContext,
  ): Promise<ApprovalFlowDetail> {
    const scene = this.handlers.getSceneDefinition(sceneCode);
    this.requireActor(audit);
    await withTransaction(this.pool, async (connection) => {
      const [[definition]] = await connection.query<DefinitionRow[]>(
        'SELECT id,scene_code,name,published_version_id,version FROM approval_flow_definitions WHERE scene_code=? AND is_deleted=0 FOR UPDATE',
        [sceneCode],
      );
      if (!definition) throw new ApprovalDomainError('FLOW_NOT_CONFIGURED', '审批流程尚未保存草稿');
      const [[draft]] = await connection.query<FlowVersionRow[]>(
        `SELECT id,definition_id,version_no,status,published_at,version
           FROM approval_flow_versions WHERE id=? AND definition_id=? AND status='draft' AND is_deleted=0 FOR UPDATE`,
        [command.draftId, definition.id],
      );
      if (!draft || Number(draft.version) !== command.version)
        throw new ApprovalDomainError('CONCURRENT_MODIFICATION', '审批草稿已变化，请刷新后重试');
      const [steps] = await connection.query<FlowStepRow[]>(
        `SELECT id,flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,assignee_source_code
           FROM approval_flow_steps WHERE flow_version_id=? AND is_deleted=0 ORDER BY step_no FOR UPDATE`,
        [draft.id],
      );
      this.assertSequentialSteps(steps);
      assertSceneAssigneeRules(scene, steps);
      for (const step of steps) {
        if (step.assignee_type === 'business') continue;
        if ((await resolveAssigneeIds(this.identity, step)).length === 0)
          throw new ApprovalDomainError(
            'NO_ELIGIBLE_ASSIGNEE',
            `节点“${step.name}”当前没有合格审批人`,
          );
      }
      await connection.execute(
        `UPDATE approval_flow_versions SET status='published',published_by=?,published_at=NOW(),updated_by=?
          WHERE id=? AND status='draft' AND version=?`,
        [audit.actorId, audit.actorId, draft.id, command.version],
      );
      await connection.execute(
        'UPDATE approval_flow_definitions SET published_version_id=?,version=version+1,updated_by=? WHERE id=?',
        [draft.id, audit.actorId, definition.id],
      );
      await writeApprovalAudit(connection, audit, 'approval.flow.publish', String(definition.id), {
        sceneCode,
        versionNo: draft.version_no,
      });
    });
    return this.getFlow(sceneCode);
  }

  /** 供申请提交事务选版：调用方已锁业务根，此处锁发布指针和版本，防止选版期间被切换。 */
  async lockPublishedFlow(
    connection: PoolConnection,
    sceneCode: string,
  ): Promise<{ flow: FlowVersionRow; steps: FlowStepRow[] }> {
    const scene = this.handlers.getSceneDefinition(sceneCode);
    const [[definition]] = await connection.query<DefinitionRow[]>(
      `SELECT id,scene_code,name,published_version_id,version
           FROM approval_flow_definitions
          WHERE scene_code=? AND is_deleted=0 FOR UPDATE`,
      [sceneCode],
    );
    if (!definition?.published_version_id)
      throw new ApprovalDomainError('FLOW_NOT_CONFIGURED', '审批流程尚未发布');
    const [[flow]] = await connection.query<FlowVersionRow[]>(
      `SELECT id,definition_id,version_no,status,published_at,version
           FROM approval_flow_versions
          WHERE id=? AND definition_id=? AND status='published' AND is_deleted=0 FOR UPDATE`,
      [definition.published_version_id, definition.id],
    );
    if (!flow) throw new ApprovalDomainError('FLOW_NOT_CONFIGURED', '审批流程版本不可用');
    const [steps] = await connection.query<FlowStepRow[]>(
      `SELECT id,flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,assignee_source_code
           FROM approval_flow_steps WHERE flow_version_id=? AND is_deleted=0 ORDER BY step_no FOR UPDATE`,
      [flow.id],
    );
    this.assertSequentialSteps(steps);
    assertSceneAssigneeRules(scene, steps);
    return { flow, steps };
  }

  private async loadFlow(db: Db, sceneCode: string): Promise<ApprovalFlowDetail> {
    const scene = this.handlers.getSceneDefinition(sceneCode);
    const [[definition]] = await db.query<DefinitionRow[]>(
      'SELECT id,scene_code,name,published_version_id,version FROM approval_flow_definitions WHERE scene_code=? AND is_deleted=0',
      [sceneCode],
    );
    const assignmentPolicy = {
      businessAssigneeSources: scene.businessAssigneeSources.map((source) => ({ ...source })),
      requiredFinalAssigneeSourceCode: scene.requiredFinalAssigneeSourceCode,
    };
    if (!definition)
      return { sceneCode, name: scene.name, ...assignmentPolicy, published: null, draft: null };
    const [versions] = await db.query<FlowVersionRow[]>(
      `SELECT id,definition_id,version_no,status,published_at,version FROM approval_flow_versions
       WHERE definition_id=? AND status IN ('published','draft') AND is_deleted=0 ORDER BY version_no DESC`,
      [definition.id],
    );
    const published = versions.find(
      (v) => v.status === 'published' && String(v.id) === String(definition.published_version_id),
    );
    const draft = versions.find((v) => v.status === 'draft');
    return {
      sceneCode,
      name: definition.name,
      ...assignmentPolicy,
      published: published ? await this.mapFlowVersion(db, published, scene) : null,
      draft: draft ? await this.mapFlowVersion(db, draft, scene) : null,
    };
  }

  private async mapFlowVersion(
    db: Db,
    row: FlowVersionRow,
    scene: ApprovalSceneDefinition,
  ): Promise<ApprovalFlowVersion> {
    const [steps] = await db.query<FlowStepRow[]>(
      'SELECT id,flow_version_id,node_code,step_no,name,assignee_type,role_id,assignee_user_id,assignee_source_code FROM approval_flow_steps WHERE flow_version_id=? AND is_deleted=0 ORDER BY step_no',
      [row.id],
    );
    const roles = new Map(
      (
        await this.identity.listRoleReferencesByIds(
          steps.flatMap((s) => (s.role_id === null ? [] : [String(s.role_id)])),
        )
      ).map((r) => [r.id, r.name]),
    );
    const users = new Map(
      (
        await this.identity.listUserReferencesByIds(
          steps.flatMap((s) => (s.assignee_user_id === null ? [] : [String(s.assignee_user_id)])),
        )
      ).map((u) => [u.id, u.displayName]),
    );
    return {
      id: String(row.id),
      versionNo: Number(row.version_no),
      version: Number(row.version),
      status: row.status,
      publishedAt: row.published_at ? toBeijingISOString(row.published_at) : null,
      steps: steps.map((s) => ({
        id: String(s.id),
        nodeCode: s.node_code,
        stepNo: Number(s.step_no),
        name: s.name,
        assigneeType: s.assignee_type,
        assigneeSourceCode: s.assignee_source_code,
        assigneeSourceName:
          s.assignee_source_code === null
            ? null
            : (scene.businessAssigneeSources.find(
                (source) => source.code === s.assignee_source_code,
              )?.name ?? s.assignee_source_code),
        roleId: s.role_id === null ? null : String(s.role_id),
        roleName: s.role_id === null ? null : (roles.get(String(s.role_id)) ?? String(s.role_id)),
        assigneeUserId: s.assignee_user_id === null ? null : String(s.assignee_user_id),
        assigneeUserName:
          s.assignee_user_id === null
            ? null
            : (users.get(String(s.assignee_user_id)) ?? String(s.assignee_user_id)),
      })),
    };
  }

  private assertSequentialSteps(steps: FlowStepRow[]): void {
    if (
      !steps.length ||
      steps.length > 20 ||
      steps.some((step, index) => step.step_no !== index + 1)
    )
      throw new ApprovalDomainError('INVALID_INPUT', '审批流程必须至少一级且顺序连续');
  }
  private newNodeCode(existing: Map<string, FlowStepRow>): string {
    let code = randomUUID();
    while (existing.has(code)) code = randomUUID();
    return code;
  }
  private requireActor(audit: CommandContext): void {
    if (!audit.actorId) throw new ApprovalDomainError('FORBIDDEN', '缺少当前操作人');
  }
}
