import { flushPromises, mount } from '@vue/test-utils';
import { KeepAlive, defineComponent, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserFormDialog from '../UserFormDialog.vue';

const { departmentOptions, roleOptions, warning } = vi.hoisted(() => ({
  departmentOptions: vi.fn(),
  roleOptions: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../../../../api/system', () => ({
  systemApi: { departmentOptions, roleOptions },
}));
vi.mock('../../../../utils/message', () => ({
  EMessage: { warning, error: vi.fn(), success: vi.fn() },
}));

const dialogStub = {
  props: ['modelValue'],
  emits: ['open', 'update:modelValue'],
  watch: {
    modelValue(this: { $emit: (e: 'open') => void }, val: boolean) {
      if (val) this.$emit('open');
    },
  },
  template: '<div class="dialog-stub"><slot/><slot name="footer"/></div>',
};

const selectStub = {
  name: 'ElSelectStub',
  emits: ['visible-change', 'change', 'update:modelValue'],
  props: { placeholder: String },
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};

const dialogStubs = {
  'el-dialog': dialogStub,
  'el-select': selectStub,
  'el-option': true,
  'el-button': { template: '<button><slot/></button>' },
  'el-input': true,
  'el-switch': true,
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
};

const openDialog = async (overrides: { editingUserId?: string | null } = {}) => {
  const wrapper = mount(UserFormDialog, {
    props: {
      visible: false,
      editingUserId: overrides.editingUserId ?? null,
      roleOptions: [],
      submitting: false,
    },
    global: { stubs: dialogStubs },
  });
  await wrapper.setProps({ visible: true });
  await flushPromises();
  return wrapper;
};

describe('UserFormDialog department candidate ownership', () => {
  beforeEach(() => {
    departmentOptions.mockReset();
    departmentOptions.mockResolvedValue([]);
    roleOptions.mockReset();
    warning.mockClear();
  });

  it('opening in create mode refreshes the self-owned department source and requests role refresh', async () => {
    const wrapper = await openDialog();

    expect(departmentOptions).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('refresh-roles')).toHaveLength(1);
  });

  it('opening in edit mode refreshes only departments, never roles', async () => {
    const wrapper = await openDialog({ editingUserId: 'u1' });

    expect(departmentOptions).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('refresh-roles')).toBeUndefined();
  });

  it('expanding the department select requests only the self-owned department source', async () => {
    const wrapper = await openDialog();
    departmentOptions.mockClear();
    roleOptions.mockClear();
    const refreshRolesBefore = wrapper.emitted('refresh-roles')?.length ?? 0;

    const button = wrapper.findAll('.select-stub').find((b) => b.text() === '请选择部门');
    expect(button).toBeDefined();
    await button!.trigger('click');
    await flushPromises();

    expect(departmentOptions).toHaveBeenCalledTimes(1);
    expect(roleOptions).not.toHaveBeenCalled();
    // 展开部门只刷新弹窗自持的部门候选，不额外请求角色刷新
    expect(wrapper.emitted('refresh-roles')?.length ?? 0).toBe(refreshRolesBefore);
  });

  it('a failing department refresh warns locally and never touches role options', async () => {
    departmentOptions.mockRejectedValue(new Error('500'));
    const wrapper = await openDialog({ editingUserId: 'u1' });

    expect(warning).toHaveBeenCalledWith('部门选项刷新失败，暂时保留上次数据');
    expect(roleOptions).not.toHaveBeenCalled();
    // 编辑模式角色字段不展示，也无需向页面请求角色刷新
    expect(wrapper.emitted('refresh-roles')).toBeUndefined();
  });

  it('refreshes the department source again when the cached page is re-activated with the dialog open', async () => {
    // KeepAlive 宿主：弹窗保持打开（visible 恒 true），切换 show 模拟离开/返回缓存页
    const show = ref(true);
    const host = defineComponent({
      components: { KeepAlive, UserFormDialog },
      setup: () => ({ show }),
      template: `
        <KeepAlive>
          <UserFormDialog
            v-if="show"
            :visible="true"
            :editing-user-id="null"
            :role-options="[]"
            :submitting="false"
            @save="() => {}"
          />
        </KeepAlive>
      `,
    });
    mount(host, { global: { stubs: dialogStubs } });
    await flushPromises();
    expect(departmentOptions).toHaveBeenCalledTimes(1); // 首次激活（弹窗已打开）刷新自持部门候选

    show.value = false; // 离开缓存页（弹窗仍保持打开状态）
    await nextTick();
    await flushPromises();
    show.value = true; // 返回缓存页：onActivated 再次刷新部门候选
    await nextTick();
    await flushPromises();

    expect(departmentOptions).toHaveBeenCalledTimes(2);
  });
});
