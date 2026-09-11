import { flushPromises, mount } from '@vue/test-utils';
import { h, type VNode } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalFlowEditorDialog from '../ApprovalFlowEditorDialog.vue';
import { flowDetail, roles } from '../../__tests__/fixtures';

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning } }));

const dialogStub = { template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>' };
const passthroughStub = { template: '<div><slot /></div>' };
const buttonStub = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};
const tableStub = {
  props: ['data'],
  template:
    '<div class="step-table"><div v-for="step in data" :key="step.rowKey" class="step-row">{{ step.name }} / {{ step.roleId }}</div><slot /></div>',
};
const tableColumnStub = {
  props: ['label'],
  setup(
    _props: { label?: string },
    context: { slots: { default?: (scope: Record<string, unknown>) => VNode[] } },
  ) {
    const row = { name: '', roleId: 'role-tech' };
    return () => h('div', { class: 'table-column-stub' }, context.slots.default?.({ row }));
  },
};
const selectStub = {
  emits: ['visible-change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="role-select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};

const mountEditor = (detail = flowDetail({ draft: true })) =>
  mount(ApprovalFlowEditorDialog, {
    props: {
      visible: true,
      detail,
      roleOptions: roles(),
      saving: false,
      publishing: false,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-alert': passthroughStub,
        'el-form': passthroughStub,
        'el-form-item': passthroughStub,
        'el-table': tableStub,
        'el-table-column': tableColumnStub,
        'el-select': selectStub,
        'el-option': true,
        'el-input': true,
        'el-empty': true,
        'el-button': buttonStub,
      },
    },
  });

type EditorVm = {
  formName: string;
  steps: Array<{ name: string; roleId: string; nodeCode?: string }>;
};

describe('ApprovalFlowEditorDialog', () => {
  beforeEach(() => warning.mockReset());

  it('loads every configured level and emits a trimmed versioned draft payload', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    const vm = wrapper.vm as unknown as EditorVm;

    expect(vm.steps).toHaveLength(2);
    expect(wrapper.findAll('.step-row').map((row) => row.text())).toEqual([
      '技术审核 / role-tech',
      '负责人审核 / role-owner',
    ]);

    vm.formName = '  BOM 审批新稿  ';
    vm.steps[0]!.name = ' 技术复核 ';
    vm.steps[1]!.roleId = 'role-owner';
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '保存草稿')!
      .trigger('click');

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          name: 'BOM 审批新稿',
          draftId: 'draft-3',
          version: 4,
          steps: [
            { nodeCode: 'technical', name: '技术复核', roleId: 'role-tech' },
            { nodeCode: 'owner', name: '负责人审核', roleId: 'role-owner' },
          ],
        },
      ],
    ]);
  });

  it('refreshes only roles when the role chooser opens', async () => {
    const wrapper = mountEditor();

    await wrapper.find('.role-select-stub').trigger('click');

    expect(wrapper.emitted('refresh-roles')).toHaveLength(1);
  });

  it('supports an unconfigured scene with no published or draft flow', async () => {
    const wrapper = mountEditor(flowDetail({ empty: true }));
    await flushPromises();
    const vm = wrapper.vm as unknown as EditorVm;

    expect(vm.steps).toEqual([]);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '添加节点')!
      .trigger('click');
    vm.formName = '新的 BOM 流程';
    vm.steps[0]!.name = '首级审核';
    vm.steps[0]!.roleId = 'role-tech';
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '保存草稿')!
      .trigger('click');

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          name: '新的 BOM 流程',
          draftId: null,
          version: null,
          steps: [{ name: '首级审核', roleId: 'role-tech' }],
        },
      ],
    ]);
  });

  it('blocks saving an incomplete multi-level configuration with a user-facing warning', async () => {
    const wrapper = mountEditor(flowDetail({ empty: true }));
    const vm = wrapper.vm as unknown as EditorVm;
    vm.formName = '流程';
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '添加节点')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '保存草稿')!
      .trigger('click');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(warning).toHaveBeenCalledWith('请补全每个节点名称和审批角色');
  });
});
