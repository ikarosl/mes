import type { ApprovalAssigneeType } from '@company/contracts';
import type { IdentityDirectoryService } from '../../identity/public.js';
import { ApprovalDomainError } from '../domain/approval.errors.js';
import type { ApprovalSceneDefinition } from '../application/approval-scenes.js';
import type { ApprovalBusinessAssigneeResolution } from '../application/approval-subject-handler.js';

/** 模板固定分派规则，业务用户由实例独立存证；当前资格始终实时校验。 */
export interface AssigneeRuleRow {
  assignee_type: ApprovalAssigneeType;
  role_id: number | string | null;
  assignee_user_id: number | string | null;
  assignee_source_code: string | null;
}

export interface InstanceAssigneeRuleRow extends AssigneeRuleRow {
  resolved_assignee_user_id: number | string | null;
}

export function assertAssigneeRule(rule: AssigneeRuleRow): void {
  if (
    (rule.assignee_type === 'role' &&
      rule.role_id != null &&
      rule.assignee_user_id === null &&
      rule.assignee_source_code === null) ||
    (rule.assignee_type === 'user' &&
      rule.role_id === null &&
      rule.assignee_user_id != null &&
      rule.assignee_source_code === null) ||
    (rule.assignee_type === 'business' &&
      rule.role_id === null &&
      rule.assignee_user_id === null &&
      typeof rule.assignee_source_code === 'string' &&
      rule.assignee_source_code.length <= 100 &&
      /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(rule.assignee_source_code))
  )
    return;
  throw new ApprovalDomainError(
    'INVALID_INPUT',
    '每个节点必须且只能选择角色、指定用户或业务关联人员之一',
  );
}

/** 保存、发布和送审使用同一来源白名单及最终放行规则。 */
export function assertSceneAssigneeRules(
  scene: ApprovalSceneDefinition,
  rules: readonly AssigneeRuleRow[],
): void {
  const supported = new Set(scene.businessAssigneeSources.map((source) => source.code));
  for (const rule of rules) {
    assertAssigneeRule(rule);
    if (rule.assignee_type === 'business' && !supported.has(rule.assignee_source_code!))
      throw new ApprovalDomainError('INVALID_INPUT', '审批节点使用了本场景不支持的业务人员来源');
  }
  const required = scene.requiredFinalAssigneeSourceCode;
  const final = rules.at(-1);
  if (
    required !== null &&
    (final?.assignee_type !== 'business' || final.assignee_source_code !== required)
  ) {
    const label = scene.businessAssigneeSources.find((source) => source.code === required)!.name;
    throw new ApprovalDomainError('INVALID_INPUT', `本场景最后一级必须由“${label}”审批`);
  }
}

/** handler 只能为已声明来源提供唯一人员；模板所需来源不可缺失。 */
export function resolveBusinessAssigneeUsers(
  scene: ApprovalSceneDefinition,
  resolutions: readonly ApprovalBusinessAssigneeResolution[],
  rules: readonly AssigneeRuleRow[],
): ReadonlyMap<string, string> {
  if (!Array.isArray(resolutions))
    throw new ApprovalDomainError('CONFLICT', '业务处理器未提供审批人员解析结果');
  const supported = new Set(scene.businessAssigneeSources.map((source) => source.code));
  const users = new Map<string, string>();
  for (const resolution of resolutions) {
    if (
      !resolution ||
      !supported.has(resolution.sourceCode) ||
      users.has(resolution.sourceCode) ||
      typeof resolution.userId !== 'string' ||
      !/^[1-9][0-9]{0,19}$/.test(resolution.userId) ||
      BigInt(resolution.userId) > 18_446_744_073_709_551_615n
    )
      throw new ApprovalDomainError('CONFLICT', '业务审批人员来源、人员或解析结果无效');
    users.set(resolution.sourceCode, resolution.userId);
  }
  for (const rule of rules) {
    if (rule.assignee_type === 'business' && !users.has(rule.assignee_source_code!))
      throw new ApprovalDomainError('CONFLICT', '业务处理器未解析流程所需的审批负责人');
  }
  return users;
}

/** 关联模板与实例字段的约束无法交给单表 CHECK，读取及决定都需校验。 */
export function assertInstanceAssigneeRule(rule: InstanceAssigneeRuleRow): void {
  assertAssigneeRule(rule);
  if (
    rule.assignee_type === 'business'
      ? rule.resolved_assignee_user_id == null ||
        !/^[1-9][0-9]*$/.test(String(rule.resolved_assignee_user_id))
      : rule.resolved_assignee_user_id !== null
  )
    throw new ApprovalDomainError('CONFLICT', '审批节点的业务人员解析记录不完整或与配置不一致');
}

export async function resolveAssigneeIds(
  identity: IdentityDirectoryService,
  rule: AssigneeRuleRow & { resolved_assignee_user_id?: number | string | null },
): Promise<string[]> {
  assertAssigneeRule(rule);
  if (rule.assignee_type === 'business') {
    const instanceRule = {
      ...rule,
      resolved_assignee_user_id: rule.resolved_assignee_user_id ?? null,
    };
    assertInstanceAssigneeRule(instanceRule);
    const userId = String(instanceRule.resolved_assignee_user_id);
    return (await identity.getApprovalActorEligibility(userId)).canDecide ? [userId] : [];
  }
  if (rule.assignee_type === 'role')
    return identity.listApprovalEligibleUserIds(String(rule.role_id));
  const userId = String(rule.assignee_user_id);
  return (await identity.getApprovalActorEligibility(userId)).canDecide ? [userId] : [];
}
