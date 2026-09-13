import type { ApprovalAssigneeType } from '@company/contracts';
import type { IdentityDirectoryService } from '../../identity/public.js';
import { ApprovalDomainError } from '../domain/approval.errors.js';

/** 不可变节点规则只固定角色或用户身份，当前资格始终由 Identity 公开能力解析。 */
export interface AssigneeRuleRow {
  assignee_type: ApprovalAssigneeType;
  role_id: number | string | null;
  assignee_user_id: number | string | null;
}

export function assertAssigneeRule(rule: AssigneeRuleRow): void {
  if (
    (rule.assignee_type === 'role' && rule.role_id !== null && rule.assignee_user_id === null) ||
    (rule.assignee_type === 'user' && rule.role_id === null && rule.assignee_user_id !== null)
  )
    return;
  throw new ApprovalDomainError('INVALID_INPUT', '每个节点必须选择一个角色或一个指定用户');
}

export async function resolveAssigneeIds(
  identity: IdentityDirectoryService,
  rule: AssigneeRuleRow,
): Promise<string[]> {
  assertAssigneeRule(rule);
  if (rule.assignee_type === 'role')
    return identity.listApprovalEligibleUserIds(String(rule.role_id));
  const userId = String(rule.assignee_user_id);
  return (await identity.getApprovalActorEligibility(userId)).canDecide ? [userId] : [];
}
