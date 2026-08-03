import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import RouteStepDialog from '../RouteStepDialog.vue';

const { routeSteps, processStepOptions, userOptions, materials, error, warning } = vi.hoisted(
  () => ({
    routeSteps: vi.fn(),
    processStepOptions: vi.fn(),
    userOptions: vi.fn(),
    materials: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
);
vi.mock('../../../../api/product', () => ({
  productApi: { routeSteps, processStepOptions, userOptions, materials },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error, warning } }));

const passthrough = { template: '<div><slot/><slot name="footer"/></div>' };

describe('RouteStepDialog', () => {
  beforeEach(() => {
    routeSteps.mockReset();
    processStepOptions.mockReset();
    userOptions.mockReset();
    materials.mockReset();
    error.mockReset();
    warning.mockReset();
  });

  const mountDialog = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    return mount(RouteStepDialog, {
      props: { visible: false, routeId: 'r1', productId: 'p1', submitting: false },
      global: {
        plugins: [pinia],
        stubs: {
          'el-dialog': passthrough,
          'el-table': true,
          'el-table-column': true,
          'el-select': true,
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
  };

  /** 与真实页面一致：先以 visible=false 挂载，再切换为 true 触发打开 watch */
  const openDialog = async (wrapper: ReturnType<typeof mountDialog>) => {
    await wrapper.setProps({ visible: true });
    await flushPromises();
  };

  const buttonByText = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
    wrapper.findAll('button').find((b) => b.text().includes(text));

  it('does not emit save when the critical route steps failed to load', async () => {
    routeSteps.mockRejectedValue(new Error('500'));
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(warning).toHaveBeenCalled();
  });

  it('saving works normally when steps loaded', async () => {
    routeSteps.mockResolvedValue([
      {
        processStepId: 's1',
        stepOrder: 1,
        defaultOwnerId: null,
        sopFileId: null,
        needInspection: false,
        needRecord: true,
        status: 1,
        remark: null,
        productMaterialIds: [],
      },
    ]);
    processStepOptions.mockResolvedValue([
      { id: 's1', stepCode: 'P1', stepName: '工序1', sopFileName: null },
    ]);
    userOptions.mockResolvedValue([{ id: 'u1', displayName: '张三' }]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');

    expect(wrapper.emitted('save')).toHaveLength(1);
    expect(warning).not.toHaveBeenCalled();
  });

  it('the refresh-process button only refreshes process, never reloads steps', async () => {
    routeSteps.mockResolvedValue([]);
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    routeSteps.mockClear();
    processStepOptions.mockClear();
    materials.mockClear();
    userOptions.mockClear();
    await buttonByText(wrapper, '刷新工序')?.trigger('click');
    await flushPromises();

    expect(processStepOptions).toHaveBeenCalledTimes(1);
    expect(routeSteps).not.toHaveBeenCalled();
    expect(materials).not.toHaveBeenCalled();
    expect(userOptions).not.toHaveBeenCalled();
  });

  it('blocks saving while route steps are still loading after opening', async () => {
    let resolveSteps!: (value: Array<{ processStepId: string }>) => void;
    routeSteps.mockImplementation(() => new Promise((resolve) => (resolveSteps = resolve)));
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('加载'));

    resolveSteps([]); // 收尾，避免悬挂 Promise
    await flushPromises();
  });

  it('ignores a late steps response from a previous route when switching routes', async () => {
    const stepA = {
      processStepId: 'sA',
      stepOrder: 1,
      defaultOwnerId: null,
      sopFileId: null,
      needInspection: false,
      needRecord: true,
      status: 1,
      remark: null,
      productMaterialIds: [],
    };
    const stepB = { ...stepA, processStepId: 'sB' };
    let resolveA!: (value: Array<typeof stepA>) => void;
    routeSteps.mockImplementation((routeId: string) =>
      routeId === 'A' ? new Promise((resolve) => (resolveA = resolve)) : Promise.resolve([stepB]),
    );
    processStepOptions.mockResolvedValue([
      { id: 'sA', stepCode: 'PA', stepName: '工序A', sopFileName: null },
      { id: 'sB', stepCode: 'PB', stepName: '工序B', sopFileName: null },
    ]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await wrapper.setProps({ visible: true, routeId: 'A' });
    await flushPromises();
    await wrapper.setProps({ routeId: 'B' });
    await flushPromises();
    resolveA([stepA]); // A 的迟到响应在切换到 B 之后才返回
    await flushPromises();

    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');
    const emitted = wrapper.emitted('save');
    expect(emitted).toBeDefined();
    const saved = (emitted?.[0]?.[0] as Array<{ processStepId: string }>) ?? [];
    expect(saved.map((s) => s.processStepId)).toEqual(['sB']);
  });
});
