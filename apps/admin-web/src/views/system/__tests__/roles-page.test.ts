import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import RolesPage from '../RolesPage.vue';

const { roles, deleteRole, confirm, success, error } = vi.hoisted(() => ({
  roles: vi.fn(),
  deleteRole: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../api/system', () => ({
  systemApi: {
    roles,
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole,
  },
}));
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ can: () => true }),
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning: vi.fn() },
}));

const roleRow = {
  id: 'r1',
  name: '操作员',
  code: 'operator',
  userCount: 0,
  status: 1,
  updatedAt: null,
};

describe('RolesPage', () => {
  it('loads the first server-paginated page on mount', async () => {
    roles.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    shallowMount(RolesPage, {
      global: {
        directives: { loading: () => undefined },
        stubs: {
          'el-form': true,
          'el-form-item': true,
          'el-input': true,
          'el-select': true,
          'el-option': true,
          'el-button': true,
          'el-tooltip': true,
          'el-table': true,
          'el-table-column': true,
          'el-tag': true,
          'el-pagination': true,
        },
      },
    });
    await flushPromises();

    expect(roles).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: undefined,
      name: undefined,
      code: undefined,
      status: undefined,
    });
  });

  it('disables the delete button while the write is pending and deletes once', async () => {
    roles.mockResolvedValue({ items: [roleRow], total: 1, page: 1, pageSize: 10 });
    let confirmResolve!: (value: unknown) => void;
    confirm.mockReturnValue(new Promise((resolve) => (confirmResolve = resolve)));

    const wrapper = mount(RolesPage, {
      global: {
        plugins: [ElementPlus],
        stubs: { RoleFormDialog: true, RolePermissionDialog: true, TableToolbar: true },
      },
    });
    await flushPromises();

    const findDelete = () => wrapper.findAll('button').find((b) => b.text().trim() === '删除');
    expect(findDelete()).toBeDefined();
    expect(findDelete()!.attributes('disabled')).toBeUndefined();

    await findDelete()!.trigger('click');
    await nextTick();
    expect(findDelete()!.attributes('disabled')).toBeDefined(); // 确认框期间行内写操作被占用
    expect(deleteRole).not.toHaveBeenCalled();

    confirmResolve('confirm');
    await flushPromises();
    expect(deleteRole).toHaveBeenCalledTimes(1);
    expect(deleteRole).toHaveBeenCalledWith('r1');
    expect(findDelete()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
  });
});
