import { h, type VNode } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RouteStepDialog from '../RouteStepDialog.vue';

const { routeSteps, processStepOptions, userOptions, error, warning } = vi.hoisted(() => ({
  routeSteps: vi.fn(),
  processStepOptions: vi.fn(),
  userOptions: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { routeSteps, processStepOptions, userOptions },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error, warning } }));

const passthrough = { template: '<div><slot/><slot name="footer"/></div>' };
const selectStub = {
  emits: ['visible-change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};
const tableColumnStub = {
  props: ['label'],
  setup(
    _props: Record<string, unknown>,
    ctx: { slots: { default?: (scope: Record<string, unknown>) => unknown } },
  ) {
    const row = {
      processStepId: 's1',
      stepOrder: 1,
      defaultOwnerId: '',
      sopFileId: '',
      needInspection: false,
      needRecord: true,
      status: 1,
      remark: '',
    };
    return () => h('div', { class: 'column-stub' }, [ctx.slots.default?.({ row })] as VNode[]);
  },
};

const loadedStep = {
  id: 'rs1',
  processStepId: 's1',
  stepOrder: 1,
  stepCode: 'P1',
  stepName: '工序1',
  description: null,
  defaultOwnerId: null,
  defaultOwnerName: null,
  sopFileId: null,
  sopFileName: null,
  needInspection: false,
  needRecord: true,
  status: 1,
  remark: null,
};

describe('RouteStepDialog', () => {
  beforeEach(() => {
    routeSteps.mockReset();
    processStepOptions.mockReset();
    userOptions.mockReset();
    error.mockReset();
    warning.mockReset();
  });

  const mountDialog = () =>
    mount(RouteStepDialog, {
      props: { visible: false, routeId: 'r1', submitting: false },
      global: {
        stubs: {
          'el-dialog': passthrough,
          'el-table': passthrough,
          'el-table-column': tableColumnStub,
          'el-select': selectStub,
          'el-option': true,
          'el-input-number': true,
          'el-switch': true,
          'el-input': true,
          'el-button': {
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot/></button>',
          },
        },
      },
    });

  const openDialog = async (wrapper: ReturnType<typeof mountDialog>) => {
    await wrapper.setProps({ visible: true });
    await flushPromises();
  };

  const buttonByText = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
    wrapper.findAll('button').find((button) => button.text().includes(text));

  const emitSelect = async (wrapper: ReturnType<typeof mountDialog>, placeholder: string) => {
    const button = wrapper.findAll('.select-stub').find((item) => item.text() === placeholder);
    expect(button).toBeDefined();
    await button!.trigger('click');
  };

  it('opening refreshes only process/user candidates and loads steps, never BOM candidates', async () => {
    routeSteps.mockResolvedValue([]);
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(routeSteps).toHaveBeenCalledTimes(1);
    expect(processStepOptions).toHaveBeenCalledTimes(1);
    expect(userOptions).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('可选物料');
  });

  it('does not emit save when the critical route steps failed to load', async () => {
    routeSteps.mockRejectedValue(new Error('500'));
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(warning).toHaveBeenCalled();
  });

  it('saving a loaded route emits steps without BOM/material fields', async () => {
    routeSteps.mockResolvedValue([loadedStep]);
    processStepOptions.mockResolvedValue([
      { id: 's1', stepCode: 'P1', stepName: '工序1', sopFileName: null },
    ]);
    userOptions.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');

    const emitted = wrapper.emitted('save');
    expect(emitted).toHaveLength(1);
    const saved = (emitted?.[0]?.[0] as Array<Record<string, unknown>>) ?? [];
    expect(saved[0]).not.toHaveProperty('productMaterialIds');
    expect(saved[0]).toMatchObject({ processStepId: 's1', stepOrder: 1 });
  });

  it('expanding a process or user select refreshes only that candidate source', async () => {
    routeSteps.mockResolvedValue([]);
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    const wrapper = mountDialog();
    await openDialog(wrapper);

    const processBefore = processStepOptions.mock.calls.length;
    const userBefore = userOptions.mock.calls.length;
    await emitSelect(wrapper, '请选择已有工序');
    expect(processStepOptions).toHaveBeenCalledTimes(processBefore + 1);
    expect(userOptions).toHaveBeenCalledTimes(userBefore);

    const processAfter = processStepOptions.mock.calls.length;
    await emitSelect(wrapper, '请选择');
    expect(userOptions).toHaveBeenCalledTimes(userBefore + 1);
    expect(processStepOptions).toHaveBeenCalledTimes(processAfter);
  });

  it('blocks saving while route steps are still loading after opening', async () => {
    let resolveSteps!: (value: (typeof loadedStep)[]) => void;
    routeSteps.mockImplementation(() => new Promise((resolve) => (resolveSteps = resolve)));
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('加载'));

    resolveSteps([]);
    await flushPromises();
  });
});
