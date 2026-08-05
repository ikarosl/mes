import { h, type VNode } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
/** el-select：点击时发射 visible-change，用于验证“展开下拉只刷新自己资源” */
const selectStub = {
  emits: ['visible-change', 'update:modelValue'],
  props: ['placeholder'],
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};
/** el-table-column：向作用域插槽提供 { row }，否则逐行下拉无法渲染 */
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
      sopFileId: null,
      needInspection: false,
      needRecord: true,
      status: 1,
      remark: '',
      productMaterialIds: [],
    };
    return () => h('div', { class: 'column-stub' }, [ctx.slots.default?.({ row })] as VNode[]);
  },
};

describe('RouteStepDialog', () => {
  beforeEach(() => {
    routeSteps.mockReset();
    processStepOptions.mockReset();
    userOptions.mockReset();
    materials.mockReset();
    error.mockReset();
    warning.mockReset();
  });

  const mountDialog = () =>
    mount(RouteStepDialog, {
      props: { visible: false, routeId: 'r1', productId: 'p1', submitting: false },
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

  /** 与真实页面一致：先以 visible=false 挂载，再切换为 true 触发打开 watch */
  const openDialog = async (wrapper: ReturnType<typeof mountDialog>) => {
    await wrapper.setProps({ visible: true });
    await flushPromises();
  };

  const buttonByText = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
    wrapper.findAll('button').find((b) => b.text().includes(text));

  const emitSelect = async (wrapper: ReturnType<typeof mountDialog>, placeholder: string) => {
    const btn = wrapper.findAll('.select-stub').find((b) => b.text() === placeholder);
    expect(btn).toBeDefined();
    await btn!.trigger('click');
  };

  it('opening the dialog refreshes process/user/material candidates and loads steps', async () => {
    routeSteps.mockResolvedValue([]);
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);

    expect(routeSteps).toHaveBeenCalledTimes(1);
    expect(processStepOptions).toHaveBeenCalledTimes(1);
    expect(userOptions).toHaveBeenCalledTimes(1);
    expect(materials).toHaveBeenCalledTimes(1);
  });

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
    const processBefore = processStepOptions.mock.calls.length;
    await buttonByText(wrapper, '刷新工序')?.trigger('click');
    await flushPromises();

    expect(processStepOptions).toHaveBeenCalledTimes(processBefore + 1);
    expect(routeSteps).toHaveBeenCalledTimes(1);
    expect(materials).toHaveBeenCalledTimes(1);
    expect(userOptions).toHaveBeenCalledTimes(1);
  });

  it('expanding the process select refreshes only process options', async () => {
    routeSteps.mockResolvedValue([]);
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    const processBefore = processStepOptions.mock.calls.length;
    const userBefore = userOptions.mock.calls.length;
    const materialBefore = materials.mock.calls.length;

    await emitSelect(wrapper, '请选择已有工序');

    expect(processStepOptions).toHaveBeenCalledTimes(processBefore + 1);
    expect(userOptions).toHaveBeenCalledTimes(userBefore);
    expect(materials).toHaveBeenCalledTimes(materialBefore);
    expect(routeSteps).toHaveBeenCalledTimes(1);
  });

  it('expanding the user select refreshes only user options', async () => {
    routeSteps.mockResolvedValue([]);
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    const processBefore = processStepOptions.mock.calls.length;
    const userBefore = userOptions.mock.calls.length;
    const materialBefore = materials.mock.calls.length;

    await emitSelect(wrapper, '请选择');

    expect(userOptions).toHaveBeenCalledTimes(userBefore + 1);
    expect(processStepOptions).toHaveBeenCalledTimes(processBefore);
    expect(materials).toHaveBeenCalledTimes(materialBefore);
    expect(routeSteps).toHaveBeenCalledTimes(1);
  });

  it('expanding the material select refreshes only material candidates', async () => {
    routeSteps.mockResolvedValue([]);
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    await openDialog(wrapper);
    const processBefore = processStepOptions.mock.calls.length;
    const userBefore = userOptions.mock.calls.length;
    const materialBefore = materials.mock.calls.length;

    await emitSelect(wrapper, '可选');

    expect(materials).toHaveBeenCalledTimes(materialBefore + 1);
    expect(processStepOptions).toHaveBeenCalledTimes(processBefore);
    expect(userOptions).toHaveBeenCalledTimes(userBefore);
    expect(routeSteps).toHaveBeenCalledTimes(1);
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

  it('keeps newly loaded steps when a stale response of the same route arrives after reopen', async () => {
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
    const resolvers: Array<(value: Array<typeof stepA>) => void> = [];
    routeSteps.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    processStepOptions.mockResolvedValue([
      { id: 'sA', stepCode: 'PA', stepName: '工序A', sopFileName: null },
      { id: 'sB', stepCode: 'PB', stepName: '工序B', sopFileName: null },
    ]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    // 第一次打开路线 R：请求挂起
    await wrapper.setProps({ visible: true, routeId: 'R' });
    await flushPromises();
    expect(routeSteps).toHaveBeenCalledTimes(1);

    // 关闭弹窗：invalidateSteps 推进请求代际
    await wrapper.setProps({ visible: false });
    await flushPromises();

    // 重新打开同一路线 R：新请求挂起
    await wrapper.setProps({ visible: true, routeId: 'R' });
    await flushPromises();
    expect(routeSteps).toHaveBeenCalledTimes(2);

    // 新请求先返回：正常写回 localSteps
    resolvers[1]([stepB]);
    await flushPromises();

    // 旧请求（代际已过期）后返回：不得清空新请求已加载的步骤
    resolvers[0]([stepA]);
    await flushPromises();

    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');
    const emitted = wrapper.emitted('save');
    expect(emitted).toBeDefined();
    const saved = (emitted?.[0]?.[0] as Array<{ processStepId: string }>) ?? [];
    expect(saved.map((s) => s.processStepId)).toEqual(['sB']);
  });

  it('ignores a stale A response when reopening A after B (A→B→A)', async () => {
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
    const stepA2 = { ...stepA, processStepId: 'sA2' };
    const stepB = { ...stepA, processStepId: 'sB' };
    const aResolvers: Array<(value: Array<typeof stepA>) => void> = [];
    routeSteps.mockImplementation((routeId: string) =>
      routeId === 'A'
        ? new Promise((resolve) => aResolvers.push(resolve))
        : Promise.resolve([stepB]),
    );
    processStepOptions.mockResolvedValue([
      { id: 'sA', stepCode: 'PA', stepName: '工序A', sopFileName: null },
      { id: 'sA2', stepCode: 'PA2', stepName: '工序A2', sopFileName: null },
      { id: 'sB', stepCode: 'PB', stepName: '工序B', sopFileName: null },
    ]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    // 第一次打开路线 A：请求挂起
    await wrapper.setProps({ visible: true, routeId: 'A' });
    await flushPromises();
    expect(routeSteps).toHaveBeenCalledTimes(1);

    // 切换到路线 B：响应立即返回并写回
    await wrapper.setProps({ routeId: 'B' });
    await flushPromises();

    // 再次打开路线 A：新请求挂起
    await wrapper.setProps({ routeId: 'A' });
    await flushPromises();
    expect(routeSteps).toHaveBeenCalledTimes(3);

    // 新 A 响应先返回：正常写回
    aResolvers[1]([stepA2]);
    await flushPromises();

    // 第一次打开 A 的旧响应后返回：不得覆盖"B 之后再打开 A"的新响应
    aResolvers[0]([stepA]);
    await flushPromises();

    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');
    const emitted = wrapper.emitted('save');
    expect(emitted).toBeDefined();
    const saved = (emitted?.[0]?.[0] as Array<{ processStepId: string }>) ?? [];
    expect(saved.map((s) => s.processStepId)).toEqual(['sA2']);
  });

  it('discards a late steps response that arrives after the dialog is closed', async () => {
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
    let resolveA!: (value: Array<typeof stepA>) => void;
    routeSteps.mockImplementation((routeId: string) =>
      routeId === 'A' ? new Promise((resolve) => (resolveA = resolve)) : Promise.resolve([]),
    );
    processStepOptions.mockResolvedValue([]);
    userOptions.mockResolvedValue([]);
    materials.mockResolvedValue([]);
    const wrapper = mountDialog();

    // 打开路线 A：步骤明细挂起
    await wrapper.setProps({ visible: true, routeId: 'A' });
    await flushPromises();
    expect(routeSteps).toHaveBeenCalledTimes(1);

    // 关闭弹窗：invalidateSteps 推进请求代际并复位 stepsStatus
    await wrapper.setProps({ visible: false });
    await flushPromises();

    // A 的迟到响应：代际已推进，不得写回 localSteps
    resolveA([stepA]);
    await flushPromises();

    // stepsStatus 已复位为 idle：保存被拦截，不会提交迟到的步骤
    await buttonByText(wrapper, '保存工序顺序')?.trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('加载'));
  });
});
