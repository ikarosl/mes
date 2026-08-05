import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemRoleOption, SystemUserListItem } from '@company/contracts';
import { useSystemUsers } from '../useSystemUsers';

const { users, departmentOptions, roleOptions } = vi.hoisted(() => ({
  users: vi.fn(),
  departmentOptions: vi.fn(),
  roleOptions: vi.fn(),
}));
vi.mock('../../../../api/system', () => ({
  systemApi: {
    users,
    departmentOptions,
    roleOptions,
  },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error: vi.fn() } }));

describe('useSystemUsers', () => {
  beforeEach(() => {
    users.mockReset();
    users.mockResolvedValue({ items: [], total: 21, page: 1, pageSize: 10 });
    departmentOptions.mockReset();
    roleOptions.mockReset();
  });

  it('loads and changes pages through the server pagination contract', async () => {
    const state = useSystemUsers(ref<SystemRoleOption[]>([]));
    state.query.keyword = ' 张三 ';
    state.query.status = 'enabled';

    await state.handleSearch();
    await state.handlePageChange(2);

    expect(state.total.value).toBe(21);
    expect(users).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 10,
      keyword: '张三',
      username: undefined,
      displayName: undefined,
      roleId: undefined,
      status: 1,
    });
    expect(users).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }));
  });

  it('discards stale list responses when a newer query supersedes them', async () => {
    const userA: SystemUserListItem = {
      id: 'u1',
      username: 'a',
      displayName: 'A',
      departmentId: null,
      departmentName: null,
      email: null,
      mobile: null,
      roleIds: [],
      roles: [],
      status: 1,
      lastLoginAt: null,
    };
    const userB: SystemUserListItem = { ...userA, id: 'u2', username: 'b', displayName: 'B' };
    let resolveFirst!: (value: {
      items: SystemUserListItem[];
      total: number;
      page: number;
      pageSize: number;
    }) => void;
    users
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ items: [userB], total: 2, page: 2, pageSize: 10 });
    const state = useSystemUsers(ref<SystemRoleOption[]>([]));

    const first = state.handlePageChange(1);
    const second = state.handlePageChange(2);
    resolveFirst({ items: [userA], total: 1, page: 1, pageSize: 10 }); // 旧请求迟到
    await Promise.all([first, second]);

    expect(state.users.value).toEqual([userB]); // 旧响应被丢弃
    expect(state.total.value).toBe(2);
    expect(state.loading.value).toBe(false);
  });

  it('no longer aggregates candidate loading; candidates belong to the page (P2)', async () => {
    const state = useSystemUsers(ref<SystemRoleOption[]>([]));

    await state.handleSearch();

    expect(departmentOptions).not.toHaveBeenCalled();
    expect(roleOptions).not.toHaveBeenCalled();
  });

  it('displays role names from the injected role options ref', () => {
    const roleOptionsRef = ref<SystemRoleOption[]>([
      { id: 'r1', name: '管理员', code: 'admin' },
      { id: 'r2', name: '操作员', code: 'operator' },
    ]);
    const state = useSystemUsers(roleOptionsRef);
    const row: SystemUserListItem = {
      id: 'u1',
      username: 'zhangsan',
      displayName: '张三',
      departmentId: null,
      departmentName: null,
      email: null,
      mobile: null,
      roleIds: ['r1', 'r2'],
      roles: [],
      status: 1,
      lastLoginAt: null,
    };

    expect(state.formatUserRoles(row)).toBe('管理员、操作员');
    expect(state.getPrimaryRoleName(row)).toBe('管理员');
    // 候选未知时回退展示原始 id/code
    expect(state.getPrimaryRoleName({ ...row, roleIds: ['unknown'] })).toBe('unknown');
    expect(state.formatUserRoles({ ...row, roleIds: [] })).toBe('-');
  });
});
