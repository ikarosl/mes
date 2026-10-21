import { describe, expect, it, vi } from 'vitest';
import type { IdentityDirectoryService } from '../../../identity/public.js';
import {
  assertAssigneeRule,
  resolveAssigneeIds,
  type AssigneeRuleRow,
} from '../approval-assignees.js';

const role: AssigneeRuleRow = {
  assignee_type: 'role',
  role_id: '9007199254740993',
  assignee_user_id: null,
  assignee_source_code: null,
};
const user: AssigneeRuleRow = {
  assignee_type: 'user',
  role_id: null,
  assignee_user_id: '9007199254740995',
  assignee_source_code: null,
};
const directory = () => ({
  listApprovalEligibleUserIds: vi.fn<(roleId: string) => Promise<string[]>>(),
  getApprovalActorEligibility: vi.fn().mockResolvedValue({ roleIds: ['7'], canDecide: true }),
});

describe('approval node assignees', () => {
  it.each([role, user])('accepts one explicit $assignee_type reference', (rule) => {
    expect(() => assertAssigneeRule(rule)).not.toThrow();
  });

  it.each<AssigneeRuleRow>([
    { assignee_type: 'role', role_id: null, assignee_user_id: null, assignee_source_code: null },
    { assignee_type: 'user', role_id: null, assignee_user_id: null, assignee_source_code: null },
    { assignee_type: 'role', role_id: '7', assignee_user_id: '8', assignee_source_code: null },
    { assignee_type: 'user', role_id: '7', assignee_user_id: '8', assignee_source_code: null },
    { assignee_type: 'role', role_id: null, assignee_user_id: '8', assignee_source_code: null },
    { assignee_type: 'user', role_id: '7', assignee_user_id: null, assignee_source_code: null },
  ])(
    'rejects an ambiguous or mismatched node rule %j before resolving identities',
    async (rule) => {
      const identity = directory();
      await expect(
        resolveAssigneeIds(identity as unknown as IdentityDirectoryService, rule),
      ).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        message: '每个节点必须且只能选择角色、指定用户或业务关联人员之一',
      });
      expect(identity.listApprovalEligibleUserIds).not.toHaveBeenCalled();
      expect(identity.getApprovalActorEligibility).not.toHaveBeenCalled();
    },
  );

  it('resolves new, removed and restored role members on each call without freezing a candidate list', async () => {
    const identity = directory();
    identity.listApprovalEligibleUserIds
      .mockResolvedValueOnce(['11', '12'])
      .mockResolvedValueOnce(['12', '13'])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['14']);
    const resolve = () => resolveAssigneeIds(identity as unknown as IdentityDirectoryService, role);
    await expect(resolve()).resolves.toEqual(['11', '12']);
    await expect(resolve()).resolves.toEqual(['12', '13']);
    await expect(resolve()).resolves.toEqual([]);
    await expect(resolve()).resolves.toEqual(['14']);
    expect(identity.listApprovalEligibleUserIds).toHaveBeenCalledWith('9007199254740993');
    expect(identity.getApprovalActorEligibility).not.toHaveBeenCalled();
  });

  it('keeps the specified user and rechecks their eligibility without substituting role peers', async () => {
    const identity = directory();
    identity.getApprovalActorEligibility
      .mockResolvedValueOnce({ roleIds: ['7'], canDecide: true })
      .mockResolvedValueOnce({ roleIds: [], canDecide: false })
      .mockResolvedValueOnce({ roleIds: ['19'], canDecide: true });
    const resolve = () => resolveAssigneeIds(identity as unknown as IdentityDirectoryService, user);
    await expect(resolve()).resolves.toEqual(['9007199254740995']);
    await expect(resolve()).resolves.toEqual([]);
    await expect(resolve()).resolves.toEqual(['9007199254740995']);
    expect(identity.getApprovalActorEligibility).toHaveBeenCalledWith('9007199254740995');
    expect(identity.listApprovalEligibleUserIds).not.toHaveBeenCalled();
  });

  it('propagates directory failures instead of treating them as no eligible users', async () => {
    const identity = directory();
    const error = new Error('directory unavailable');
    identity.listApprovalEligibleUserIds.mockRejectedValue(error);
    await expect(
      resolveAssigneeIds(identity as unknown as IdentityDirectoryService, role),
    ).rejects.toBe(error);
  });
});
