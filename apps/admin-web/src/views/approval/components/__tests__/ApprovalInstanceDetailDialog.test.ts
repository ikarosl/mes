import { flushPromises, mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalInstanceDetailDialog from '../ApprovalInstanceDetailDialog.vue';
import { instanceDetail } from '../../__tests__/fixtures';

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning } }));

const passthrough = { template: '<div><slot /></div>' };
const dialogStub = { template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>' };
const emptyStub = {
  props: ['description'],
  template: '<div class="empty-stub">{{ description }}</div>',
};
const buttonStub = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};
const tableColumnStub = {
  props: ['label'],
  setup(
    _props: Record<string, unknown>,
    context: { slots: { default?: (scope: Record<string, unknown>) => VNode[] } },
  ) {
    return () =>
      h(
        'div',
        { class: 'table-column-stub' },
        context.slots.default?.({ row: { materialId: 'material-1' } }),
      );
  },
};

const mountDetail = (overrides: Record<string, unknown> = {}) =>
  mount(ApprovalInstanceDetailDialog, {
    props: {
      visible: true,
      detail: instanceDetail(),
      submitting: false,
      ...overrides,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-alert': passthrough,
        'el-descriptions': passthrough,
        'el-descriptions-item': passthrough,
        'el-tag': passthrough,
        'el-table': passthrough,
        'el-table-column': tableColumnStub,
        'el-timeline': passthrough,
        'el-timeline-item': passthrough,
        'el-empty': emptyStub,
        'el-input': true,
        'el-button': buttonStub,
      },
    },
  });

type DetailVm = { comment: string };

describe('ApprovalInstanceDetailDialog', () => {
  beforeEach(() => warning.mockReset());

  it('renders the frozen BOM evidence, current task and processing history without legacy flags', async () => {
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.text()).toContain('P-001');
    expect(wrapper.text()).toContain('物料一');
    expect(wrapper.text()).toContain('审批人');
    expect(wrapper.text()).toContain('提交申请');
    expect(wrapper.text()).not.toContain('关键物料');
    expect(wrapper.text()).not.toContain('记录批次');
    expect(wrapper.text()).not.toContain('需记录批次');
  });

  it('shows only operations granted by the server response', async () => {
    const wrapper = mountDetail({
      detail: instanceDetail({ canApprove: false, canWithdraw: true, canReassign: true }),
    });

    expect(wrapper.text()).not.toContain('通过当前节点');
    expect(wrapper.text()).not.toContain('驳回申请');
    expect(wrapper.text()).toContain('重新分派');
    expect(wrapper.text()).toContain('撤回申请');

    await wrapper.setProps({ detail: instanceDetail({ status: 'approved', canWithdraw: true }) });
    expect(wrapper.text()).not.toContain('撤回申请');
    expect(wrapper.text()).not.toContain('重新分派');
  });

  it('requires a reason for rejection and reassign, while approve and withdraw return trimmed comments', async () => {
    const wrapper = mountDetail();
    const vm = wrapper.vm as unknown as DetailVm;

    await wrapper
      .findAll('button')
      .find((button) => button.text() === '驳回申请')!
      .trigger('click');
    expect(warning).toHaveBeenCalledWith('驳回申请必须填写原因');
    expect(wrapper.emitted('reject')).toBeUndefined();

    vm.comment = '  设计参数不完整  ';
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '驳回申请')!
      .trigger('click');
    expect(wrapper.emitted('reject')).toEqual([['设计参数不完整']]);

    vm.comment = '  同步角色成员  ';
    await wrapper.setProps({
      detail: instanceDetail({ canApprove: false, canWithdraw: false, canReassign: true }),
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重新分派')!
      .trigger('click');
    expect(wrapper.emitted('reassign')).toEqual([['同步角色成员']]);

    vm.comment = '  说明  ';
    await wrapper.setProps({
      detail: instanceDetail({ canApprove: true, canWithdraw: true, canReassign: false }),
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '通过当前节点')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '撤回申请')!
      .trigger('click');
    expect(wrapper.emitted('approve')).toEqual([['说明']]);
    expect(wrapper.emitted('withdraw')).toEqual([['说明']]);
  });

  it('keeps a blocked pending instance actionable only for an authorized reassign', async () => {
    const wrapper = mountDetail({
      detail: instanceDetail({
        blocked: true,
        canApprove: false,
        canWithdraw: false,
        canReassign: true,
        steps: [
          {
            ...instanceDetail().steps[0]!,
            status: 'blocked',
            blockedReason: 'no_eligible_assignee',
            tasks: [],
          },
        ],
      }),
    });

    expect(wrapper.text()).toContain('暂无合格审批人');
    expect(wrapper.text()).toContain('重新分派');
    expect(wrapper.text()).not.toContain('通过当前节点');
  });
});
