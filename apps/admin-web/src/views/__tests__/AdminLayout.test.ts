import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import AdminLayout from '../AdminLayout.vue';

const { can, logout } = vi.hoisted(() => ({
  can: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../stores/auth', () => ({ useAuthStore: () => ({ can, logout, session: null }) }));
vi.mock('../../stores/tabs', () => ({
  useTabsStore: () => ({ tabs: [], keepAliveNames: [], close: vi.fn() }),
}));

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/approval/inbox', component: { template: '<div />' } }],
});

const menuStub = { template: '<div class="menu"><slot /></div>' };
const subMenuStub = {
  template: '<section class="menu-group"><header><slot name="title" /></header><slot /></section>',
};
const menuItemStub = { template: '<div class="menu-item"><slot /></div>' };
const buttonStub = {
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
};

describe('AdminLayout approval permissions', () => {
  beforeEach(async () => {
    can.mockReset();
    logout.mockReset().mockResolvedValue(undefined);
    await router.push('/approval/inbox');
    await router.isReady();
  });

  const mountLayout = () =>
    mount(AdminLayout, {
      global: {
        plugins: [router],
        stubs: {
          'el-menu': menuStub,
          'el-sub-menu': subMenuStub,
          'el-menu-item': menuItemStub,
          'el-button': buttonStub,
          'router-view': true,
        },
      },
    });

  it('shows the inbox for any approved inbox permission and hides flow configuration without configure', () => {
    can.mockImplementation((required: string | readonly string[]) =>
      Array.isArray(required)
        ? required.includes(PERMISSIONS.approval.view)
        : required === PERMISSIONS.approval.view,
    );
    const wrapper = mountLayout();

    expect(wrapper.text()).toContain('审批待办');
    expect(wrapper.text()).not.toContain('审批流程配置');
  });

  it('shows flow configuration only when approval:configure is granted', () => {
    can.mockImplementation(
      (required: string | readonly string[]) => required === PERMISSIONS.approval.configure,
    );
    const wrapper = mountLayout();

    expect(wrapper.text()).toContain('审批流程配置');
    expect(wrapper.text()).not.toContain('审批待办');
  });
});
