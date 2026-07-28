import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    departmentOptions.mockResolvedValue([]);
    roleOptions.mockReset();
    roleOptions.mockResolvedValue([]);
  });

  it('loads and changes pages through the server pagination contract', async () => {
    const state = useSystemUsers();
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

  it('coalesces concurrent live option refreshes', async () => {
    const state = useSystemUsers();

    await Promise.all([state.loadOptions(), state.loadOptions(), state.loadOptions()]);

    expect(departmentOptions).toHaveBeenCalledOnce();
    expect(roleOptions).toHaveBeenCalledOnce();
  });
});
