import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalInboxPage from '../ApprovalInboxPage.vue';
import { instanceDetail, instanceListItem } from './fixtures';

const { instances, instance, approve, reject, withdraw, reassign, success, error, can } =
  vi.hoisted(() => ({
    instances: vi.fn(),
    instance: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    withdraw: vi.fn(),
    reassign: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    can: vi.fn(),
  }));
vi.mock('../../../api/approval', () => ({
  approvalApi: { instances, instance, approve, reject, withdraw, reassign },
}));
vi.mock('../../../stores/auth', () => ({ useAuthStore: () => ({ can }) }));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning: vi.fn() },
}));

const detailDialogStub = {
  name: 'ApprovalInstanceDetailDialog',
  props: ['visible', 'detail', 'submitting'],
  emits: ['approve', 'reject', 'withdraw', 'reassign', 'update:visible'],
  template: `
    <div v-if="visible && detail" class="detail-dialog-stub">
      <button class="approve-action" @click="$emit('approve', '通过意见')">通过</button>
      <button class="reject-action" @click="$emit('reject', '驳回原因')">驳回</button>
      <button class="withdraw-action" @click="$emit('withdraw', '撤回说明')">撤回</button>
      <button class="reassign-action" @click="$emit('reassign', '重新分派原因')">重分派</button>
    </div>
  `,
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/approval/inbox', name: 'approval-inbox-test', component: ApprovalInboxPage }],
});

describe('ApprovalInboxPage', () => {
  beforeEach(async () => {
    instances.mockReset();
    instance.mockReset();
    approve.mockReset();
    reject.mockReset();
    withdraw.mockReset();
    reassign.mockReset();
    success.mockReset();
    error.mockReset();
    can.mockReset().mockReturnValue(false);
    instances.mockResolvedValue({
      items: [instanceListItem()],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    instance.mockResolvedValue(instanceDetail());
    approve.mockResolvedValue(instanceDetail({ version: 7 }));
    reject.mockResolvedValue(instanceDetail({ status: 'rejected', version: 7 }));
    withdraw.mockResolvedValue(instanceDetail({ status: 'withdrawn', version: 7 }));
    reassign.mockResolvedValue(instanceDetail({ version: 7 }));
    await router.push('/approval/inbox');
    await router.isReady();
  });

  const mountPage = () =>
    mount(ApprovalInboxPage, {
      global: {
        plugins: [ElementPlus, router],
        stubs: { ApprovalInstanceDetailDialog: detailDialogStub },
      },
    });

  it('loads all applications by default and opens details from a list row', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(instances).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      scope: 'all',
      status: undefined,
      subjectId: undefined,
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '查看详情')!
      .trigger('click');
    await flushPromises();

    expect(instance).toHaveBeenCalledWith('instance-1');
    expect(wrapper.find('.detail-dialog-stub').exists()).toBe(true);
  });

  it('switches todo scope to a status-free query and keeps status filtering for historical scopes', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      query: { scope: string; status: string };
      changeScope: () => Promise<void>;
    };

    vm.query.scope = 'todo';
    vm.query.status = 'approved';
    await vm.changeScope();
    expect(instances).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      scope: 'todo',
      status: undefined,
      subjectId: undefined,
    });
    expect(vm.query.status).toBe('');

    vm.query.scope = 'mine';
    vm.query.status = 'approved';
    await vm.changeScope();
    expect(instances).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      scope: 'mine',
      status: 'approved',
      subjectId: undefined,
    });

    // changeScope deliberately clears status only for todo; a selected historical
    // status is sent by the normal status-select change handler.
    vm.query.status = 'approved';
    await (vm as unknown as { search: () => Promise<void> }).search();
    expect(instances).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      scope: 'mine',
      status: 'approved',
      subjectId: undefined,
    });
  });

  it('passes the server version and current taskId for approve/reject, and version for withdraw/reassign', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '查看详情')!
      .trigger('click');
    await flushPromises();

    await wrapper.find('.approve-action').trigger('click');
    await flushPromises();
    expect(approve).toHaveBeenCalledWith('instance-1', {
      version: 6,
      taskId: 'task-1',
      comment: '通过意见',
    });

    await wrapper.find('.reject-action').trigger('click');
    await flushPromises();
    expect(reject).toHaveBeenCalledWith('instance-1', {
      version: 7,
      taskId: 'task-1',
      comment: '驳回原因',
    });

    await wrapper.find('.withdraw-action').trigger('click');
    await flushPromises();
    expect(withdraw).toHaveBeenCalledWith('instance-1', {
      version: 7,
      comment: '撤回说明',
    });

    await wrapper.find('.reassign-action').trigger('click');
    await flushPromises();
    expect(reassign).toHaveBeenCalledWith('instance-1', {
      version: 7,
      comment: '重新分派原因',
    });
  });

  it('labels the all scope according to page permissions', async () => {
    can.mockReturnValue(false);
    const regular = mountPage();
    await flushPromises();
    expect(regular.text()).toContain('与我相关');
    regular.unmount();

    can.mockReturnValue(true);
    const administrator = mountPage();
    await flushPromises();
    expect(administrator.text()).toContain('全部申请');
  });

  it('drops a stale detail response after opening a newer instance', async () => {
    let resolveFirst!: (value: unknown) => void;
    instance.mockImplementation((id: string) =>
      id === 'instance-1'
        ? new Promise((resolve) => (resolveFirst = resolve))
        : Promise.resolve(instanceDetail({ id: 'instance-2', subjectId: 'product-2' })),
    );
    instances.mockResolvedValue({
      items: [instanceListItem({ id: 'instance-1' }), instanceListItem({ id: 'instance-2' })],
      total: 2,
      page: 1,
      pageSize: 10,
    });
    const wrapper = mountPage();
    await flushPromises();
    const buttons = wrapper.findAll('button').filter((button) => button.text() === '查看详情');
    expect(buttons).toHaveLength(2);
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
    await flushPromises();
    resolveFirst(instanceDetail({ id: 'instance-1' }));
    await flushPromises();

    expect(
      wrapper.findComponent({ name: 'ApprovalInstanceDetailDialog' }).props('detail'),
    ).toMatchObject({ id: 'instance-2' });
    expect(instance).toHaveBeenNthCalledWith(2, 'instance-2');
  });
});
