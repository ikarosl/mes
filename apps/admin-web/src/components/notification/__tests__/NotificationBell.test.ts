import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@company/contracts';
import NotificationBell from '../NotificationBell.vue';

const { read, open, refresh, changePage, changeFilter } = vi.hoisted(() => ({
  read: vi.fn(),
  open: vi.fn(),
  refresh: vi.fn(),
  changePage: vi.fn(),
  changeFilter: vi.fn(),
}));
vi.mock('../useNotifications', async () => {
  const { ref } = await import('vue');
  return {
    useNotifications: () => ({
      items: ref<NotificationItem[]>([
        {
          id: '1',
          notificationId: '10',
          eventType: 'approval_task_assigned',
          title: '审批待处理',
          body: '请处理审批申请',
          targetType: 'approval_instance',
          targetId: '100',
          createdAt: '2026-09-14T10:00:00+08:00',
          readAt: null,
          version: 0,
        },
      ]),
      unreadCount: ref(1),
      total: ref(1),
      page: ref(1),
      pageSize: 10,
      readFilter: ref('all'),
      loading: ref(false),
      failed: ref(false),
      visible: ref(true),
      pending: ref(new Set<string>()),
      open,
      refresh,
      changePage,
      changeFilter,
      read,
    }),
  };
});
vi.mock('../../../utils/message', () => ({ EMessage: { error: vi.fn() } }));

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/approval/inbox', name: 'approval-inbox', component: { template: '<div />' } },
  ],
});

const popoverStub = {
  props: ['visible'],
  emits: ['update:visible', 'show'],
  template: '<div class="popover-stub"><slot name="reference" /><slot /></div>',
};

describe('NotificationBell', () => {
  beforeEach(async () => {
    read.mockReset().mockResolvedValue(true);
    open.mockReset();
    refresh.mockReset();
    changePage.mockReset();
    changeFilter.mockReset();
    await router.push('/');
    await router.isReady();
  });

  it('marks a target notification read before navigating and closes the panel', async () => {
    const wrapper = mount(NotificationBell, {
      global: {
        plugins: [ElementPlus, router],
        stubs: {
          'el-popover': popoverStub,
          'el-badge': { template: '<span><slot /></span>' },
          'el-icon': { template: '<span><slot /></span>' },
          'el-button': {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
          'el-radio-group': { template: '<div><slot /></div>' },
          'el-radio-button': { template: '<button><slot /></button>' },
          'el-empty': { template: '<div />' },
          'el-pagination': { template: '<div />' },
        },
      },
    });

    await wrapper
      .findAll('.notification-item button')
      .find((button) => button.text() === '查看详情')!
      .trigger('click');
    await flushPromises();

    expect(read).toHaveBeenCalledWith(expect.objectContaining({ id: '1', targetId: '100' }));
    expect(router.currentRoute.value.name).toBe('approval-inbox');
    expect(router.currentRoute.value.query).toEqual({ instanceId: '100' });
    expect((wrapper.vm as unknown as { visible: boolean }).visible).toBe(false);
  });

  it('keeps the panel open and does not navigate when marking a target read fails', async () => {
    read.mockResolvedValue(false);
    const wrapper = mount(NotificationBell, {
      global: {
        plugins: [ElementPlus, router],
        stubs: {
          'el-popover': popoverStub,
          'el-badge': { template: '<span><slot /></span>' },
          'el-icon': { template: '<span><slot /></span>' },
          'el-button': {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
          'el-radio-group': { template: '<div><slot /></div>' },
          'el-radio-button': { template: '<button><slot /></button>' },
          'el-empty': { template: '<div />' },
          'el-pagination': { template: '<div />' },
        },
      },
    });

    await wrapper
      .findAll('.notification-item button')
      .find((button) => button.text() === '查看详情')!
      .trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('home');
    expect((wrapper.vm as unknown as { visible: boolean }).visible).toBe(true);
  });
});
