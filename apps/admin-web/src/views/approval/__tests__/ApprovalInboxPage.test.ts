import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalInboxPage from '../ApprovalInboxPage.vue';
import { instanceDetail, instanceListItem } from './fixtures';

const { instances, instance, approve, reject, withdraw, success, error, can } = vi.hoisted(() => ({
  instances: vi.fn(),
  instance: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  withdraw: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  can: vi.fn(),
}));
vi.mock('../../../api/approval', () => ({
  approvalApi: { instances, instance, approve, reject, withdraw },
}));
vi.mock('../../../stores/auth', () => ({ useAuthStore: () => ({ can }) }));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning: vi.fn() },
}));

const detailDialogStub = {
  name: 'ApprovalInstanceDetailDialog',
  props: ['visible', 'detail', 'submitting'],
  emits: ['approve', 'reject', 'withdraw', 'update:visible'],
  template: `
    <div v-if="visible && detail" class="detail-dialog-stub">
      <button class="approve-action" @click="$emit('approve', '通过意见')">通过</button>
      <button class="reject-action" @click="$emit('reject', '驳回原因')">驳回</button>
      <button class="withdraw-action" @click="$emit('withdraw', '撤回说明')">撤回</button>
    </div>
  `,
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/approval/inbox', name: 'approval-inbox', component: ApprovalInboxPage }],
});

describe('ApprovalInboxPage', () => {
  beforeEach(async () => {
    instances.mockReset();
    instance.mockReset();
    approve.mockReset();
    reject.mockReset();
    withdraw.mockReset();
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

  it('accepts notification deep-link query parameters and keeps the subject filter', async () => {
    await router.push({
      name: 'approval-inbox',
      query: { instanceId: 'instance-1', subjectId: 'product-1' },
    });
    const wrapper = mountPage();
    await flushPromises();

    expect(instance).toHaveBeenCalledWith('instance-1');
    expect(instances).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      scope: 'all',
      status: undefined,
      subjectId: 'product-1',
    });
    expect(wrapper.find('.detail-dialog-stub').exists()).toBe(true);
    expect((wrapper.vm as unknown as { query: { subjectId: string } }).query.subjectId).toBe(
      'product-1',
    );

    await wrapper
      .findComponent({ name: 'ApprovalInstanceDetailDialog' })
      .vm.$emit('update:visible', false);
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ subjectId: 'product-1' });
    expect(wrapper.find('.detail-dialog-stub').exists()).toBe(false);
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

  it('passes the server version and current stepId for approve/reject, and version for withdraw', async () => {
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
      stepId: 'step-1',
      comment: '通过意见',
    });

    await wrapper.find('.reject-action').trigger('click');
    await flushPromises();
    expect(reject).toHaveBeenCalledWith('instance-1', {
      version: 7,
      stepId: 'step-1',
      comment: '驳回原因',
    });

    await wrapper.find('.withdraw-action').trigger('click');
    await flushPromises();
    expect(withdraw).toHaveBeenCalledWith('instance-1', {
      version: 7,
      comment: '撤回说明',
    });
  });

  it('reloads the detail after a qualification failure before allowing another decision', async () => {
    const refreshed = instanceDetail({
      blocked: true,
      canApprove: false,
      currentStepId: 'step-1',
      steps: [
        {
          ...instanceDetail().steps[0]!,
          status: 'blocked',
          blockedReason: 'no_eligible_assignee',
          eligibleUsers: [],
        },
        instanceDetail().steps[1]!,
      ],
    });
    instance.mockReset();
    instance.mockResolvedValueOnce(instanceDetail()).mockResolvedValueOnce(refreshed);
    approve.mockRejectedValueOnce(new Error('审批资格已失效'));

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
      stepId: 'step-1',
      comment: '通过意见',
    });
    expect(instance).toHaveBeenNthCalledWith(2, 'instance-1');
    expect(
      wrapper.findComponent({ name: 'ApprovalInstanceDetailDialog' }).props('detail'),
    ).toMatchObject({ blocked: true, canApprove: false });
    expect(error).toHaveBeenCalledWith(expect.any(Error), '审批操作失败');
  });

  it('closes stale details when a qualification failure also makes the reread unauthorized', async () => {
    instance.mockReset();
    instance
      .mockResolvedValueOnce(instanceDetail())
      .mockRejectedValueOnce(new Error('无权查看审批详情'));
    approve.mockRejectedValueOnce(new Error('审批资格已失效'));

    const wrapper = mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '查看详情')!
      .trigger('click');
    await flushPromises();

    await wrapper.find('.approve-action').trigger('click');
    await flushPromises();

    const dialog = wrapper.findComponent({ name: 'ApprovalInstanceDetailDialog' });
    expect(dialog.props('detail')).toBeNull();
    expect(dialog.props('visible')).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.any(Error), '审批详情刷新失败');
  });

  it('does not let a late decision reread overwrite a newer application detail', async () => {
    let resolveReread!: (value: unknown) => void;
    let instanceOneReads = 0;
    instances.mockResolvedValue({
      items: [instanceListItem({ id: 'instance-1' }), instanceListItem({ id: 'instance-2' })],
      total: 2,
      page: 1,
      pageSize: 10,
    });
    instance.mockImplementation((id: string) => {
      if (id === 'instance-2') {
        return Promise.resolve(instanceDetail({ id: 'instance-2', subjectId: 'product-2' }));
      }
      instanceOneReads += 1;
      if (instanceOneReads === 1) return Promise.resolve(instanceDetail({ id: 'instance-1' }));
      return new Promise((resolve) => {
        resolveReread = resolve;
      });
    });
    approve.mockRejectedValueOnce(new Error('审批资格已失效'));

    const wrapper = mountPage();
    await flushPromises();
    const rows = wrapper.findAll('button').filter((button) => button.text() === '查看详情');
    await rows[0]!.trigger('click');
    await flushPromises();

    // Start the failing decision and leave its detail reread pending.
    await wrapper.find('.approve-action').trigger('click');
    await flushPromises();
    expect(instance).toHaveBeenLastCalledWith('instance-1');

    const refreshedRows = wrapper
      .findAll('button')
      .filter((button) => button.text() === '查看详情');
    await refreshedRows[1]!.trigger('click');
    await flushPromises();
    expect(
      wrapper.findComponent({ name: 'ApprovalInstanceDetailDialog' }).props('detail'),
    ).toMatchObject({ id: 'instance-2' });

    resolveReread(instanceDetail({ id: 'instance-1', subjectId: 'product-1' }));
    await flushPromises();
    expect(
      wrapper.findComponent({ name: 'ApprovalInstanceDetailDialog' }).props('detail'),
    ).toMatchObject({ id: 'instance-2' });
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
