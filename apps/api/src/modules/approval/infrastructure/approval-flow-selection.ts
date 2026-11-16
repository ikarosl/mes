import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ApprovalFlowVersionStatus } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import type { ApprovalSceneDefinition } from '../application/approval-scenes.js';
import { ApprovalDomainError } from '../domain/approval.errors.js';
import { assertSceneAssigneeRules, type AssigneeRuleRow } from './approval-assignees.js';

export interface DefinitionRow extends RowDataPacket {
  id: number;
  scene_code: string;
  name: string;
  published_version_id: number | null;
  is_enabled: number;
  version: number;
}

export interface FlowVersionRow extends RowDataPacket {
  id: number;
  definition_id: number;
  version_no: number;
  status: ApprovalFlowVersionStatus;
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

/** 唯一场景键先取得排他锁，避免多个提交先读空行再并发创建的间隙锁竞态。 */
export async function ensureApprovalDefinition(
  connection: PoolConnection,
  sceneCode: string,
  name: string,
  audit: CommandContext,
): Promise<DefinitionRow> {
  await connection.execute(
    `INSERT INTO approval_flow_definitions (scene_code,name,created_by,updated_by)
     VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
    [sceneCode, name, audit.actorId, audit.actorId],
  );
  const [[definition]] = await connection.query<DefinitionRow[]>(
    'SELECT id,scene_code,name,published_version_id,is_enabled,version FROM approval_flow_definitions WHERE scene_code=? AND is_deleted=0 FOR UPDATE',
    [sceneCode],
  );
  if (!definition) throw new ApprovalDomainError('FLOW_NOT_CONFIGURED', '审批流程定义不可用');
  return definition;
}

/** 调用方已持有定义根锁；开启与提交使用同一选版校验，异常配置不能降为免审。 */
export async function lockPublishedApprovalFlow(
  connection: PoolConnection,
  definition: DefinitionRow,
  scene: ApprovalSceneDefinition,
): Promise<{ flow: FlowVersionRow; steps: FlowStepRow[] }> {
  if (!definition.published_version_id)
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
  assertSequentialApprovalSteps(steps);
  assertSceneAssigneeRules(scene, steps);
  return { flow, steps };
}

export function assertSequentialApprovalSteps(steps: FlowStepRow[]): void {
  if (!steps.length || steps.length > 20 || steps.some((step, index) => step.step_no !== index + 1))
    throw new ApprovalDomainError('INVALID_INPUT', '审批流程必须至少一级且顺序连续');
}
