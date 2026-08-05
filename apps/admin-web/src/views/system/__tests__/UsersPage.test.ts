import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import UsersPage from '../UsersPage.vue';
import UserFormDialog from '../components/UserFormDialog.vue';
import UserRoleDialog from '../components/UserRoleDialog.vue';

const {
  list,
  setStatus,
  createUser,
  confirm,
  success,
  error,
  warning,
  departmentOptions,
  roleOptions,
} = vi.hoisted(() => ({
  list: vi.fn(),
  setStatus: vi.fn(),
  createUser: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  departmentOptions: vi.fn(),
  roleOptions: vi.fn(),
}));

vi.mock('../../../api/system', () => ({
  systemApi: {
    users: list,
    departmentOptions,
    roleOptions,
    createUser,
    setUserStatus: setStatus,
  },
}));
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ can: () => true }),
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning },
}));

const userRow = {
  id: 'u1',
  username: 'admin',
  displayName: '管理员',
  departmentName: null,
  status: 1,
  lastLoginAt: null,
  roleIds: [],
  roles: [],
};

describe('UsersPage', () => {
  const mountPage = () =>
    mount(UsersPage, {
      global: {
        plugins: [ElementPlus, createPinia()],
        stubs: {
          TableToolbar: true,
          UserFormDialog: true,
          UserPasswordDialog: true,
          UserRoleDialog: true,
        },
      },
    });

  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    setStatus.mockReset();
    setStatus.mockResolvedValue(undefined);
    createUser.mockReset();
    createUser.mockResolvedValue({ id: 'n1' });
    departmentOptions.mockReset();
    departmentOptions.mockResolvedValue([]);
    roleOptions.mockReset();
    roleOptions.mockResolvedValue([]);
    confirm.mockReset();
    success.mockReset();
    error.mockReset();
    warning.mockReset();
  });

  describe('row write guard', () => {
    it('disables the toggle-status button while the write is pending and submits once', async () => {
      list.mockResolvedValue({ items: [userRow], total: 1, page: 1, pageSize: 10 });
      let confirmResolve!: (value: unknown) => void;
      confirm.mockReturnValue(new Promise((resolve) => (confirmResolve = resolve)));

      const wrapper = mountPage();
      await flushPromises();

      const findToggle = () => wrapper.findAll('button').find((b) => b.text().trim() === '停用');
      expect(findToggle()).toBeDefined();
      expect(findToggle()!.attributes('disabled')).toBeUndefined();

      await findToggle()!.trigger('click');
      await nextTick();
      expect(findToggle()!.attributes('disabled')).toBeDefined(); // 确认框期间行内写操作被占用
      expect(setStatus).not.toHaveBeenCalled();

      confirmResolve('confirm');
      await flushPromises();
      expect(setStatus).toHaveBeenCalledTimes(1);
      expect(setStatus).toHaveBeenCalledWith('u1', { status: 0 });
      expect(findToggle()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
    });
  });

  describe('candidate options isolation (P2)', () => {
    /** 页面内第一个 el-select：岗位筛选下拉 */
    const roleFilterSelect = (wrapper: ReturnType<typeof mountPage>) =>
      wrapper.findAllComponents({ name: 'ElSelect' })[0];

    it('expanding the role filter select requests only role options', async () => {
      const wrapper = mountPage();
      await flushPromises();
      departmentOptions.mockClear();
      roleOptions.mockClear();

      await roleFilterSelect(wrapper).vm.$emit('visible-change', true);
      await flushPromises();

      expect(roleOptions).toHaveBeenCalledTimes(1);
      expect(departmentOptions).not.toHaveBeenCalled();
    });

    it('a role refresh from the role dialog requests only role options', async () => {
      const wrapper = mountPage();
      await flushPromises();
      departmentOptions.mockClear();
      roleOptions.mockClear();

      // UserRoleDialog 展开角色下拉时向外发射 refresh-roles，页面只刷新角色候选
      wrapper.findComponent(UserRoleDialog).vm.$emit('refresh-roles');
      await flushPromises();

      expect(roleOptions).toHaveBeenCalledTimes(1);
      expect(departmentOptions).not.toHaveBeenCalled();
    });

    it('saving a user refreshes only the user list, never the candidates', async () => {
      const wrapper = mountPage();
      await flushPromises();
      list.mockClear();
      departmentOptions.mockClear();
      roleOptions.mockClear();

      // UserFormDialog 保存成功后：只重载用户列表，不再刷新部门/角色候选（P2）
      wrapper.findComponent(UserFormDialog).vm.$emit('save', {
        username: 'zhangsan',
        password: '123456',
        displayName: '张三',
        departmentId: 'd1',
        email: '',
        mobile: '',
        enabled: true,
        roleIds: ['r1'],
      });
      await flushPromises();

      expect(createUser).toHaveBeenCalledWith({
        username: 'zhangsan',
        password: '123456',
        displayName: '张三',
        departmentId: 'd1',
        email: null,
        mobile: null,
        status: 1,
        roleIds: ['r1'],
      });
      expect(list).toHaveBeenCalledTimes(1); // 保存后只刷新用户列表
      expect(departmentOptions).not.toHaveBeenCalled();
      expect(roleOptions).not.toHaveBeenCalled();
    });
  });
});
