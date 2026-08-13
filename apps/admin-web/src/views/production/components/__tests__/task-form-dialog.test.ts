import { nextTick } from 'vue';
import { h, type VNode } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskFormDialog from '../TaskFormDialog.vue';

const { productOptions, routeOptions, routeSteps, workOrderOptions } = vi.hoisted(() => ({
  productOptions: vi.fn(),
  routeOptions: vi.fn(),
  routeSteps: vi.fn(),
  workOrderOptions: vi.fn(),
}));

// 弹窗自持候选源：产品 / 工艺路线（api/product）、已下达工单（api/production /options 契约）
vi.mock('../../../../api/product', () => ({
  productApi: { productOptions, routeOptions, routeSteps },
}));
vi.mock('../../../../api/production', () => ({
  productionApi: { workOrderOptions },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { warning: vi.fn(), error: vi.fn() } }));
import { EMessage } from '../../../../utils/message';

const selectStub = {
  name: 'ElSelectStub',
  emits: ['visible-change', 'change', 'update:modelValue'],
  props: {
    placeholder: String,
    filterable: Boolean,
    remote: Boolean,
    remoteMethod: Function,
  },
  template:
    '<button class="select-stub" @click="$emit(\'visible-change\', true)">{{ placeholder }}</button>',
};

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

/** 渲染默认插槽的透传 stub：`true` 会丢弃插槽内容，导致弹窗内表单不渲染 */
const passthroughStub = { template: '<div><slot /></div>' };

/** el-table-column：向作用域插槽提供 { row }，否则工序预览表格的逐行下拉无法渲染 */
const tableColumnStub = {
  props: ['prop', 'label'],
  setup(
    _props: Record<string, unknown>,
    ctx: { slots: { default?: (scope: Record<string, unknown>) => VNode[] } },
  ) {
    const row = {
      id: 'step1',
      stepOrder: 1,
      stepName: '工序1',
      sopFileName: null,
      defaultOwnerName: null,
      actualSopFileId: null,
      responsibleUserId: null,
    };
    return () => h('div', { class: 'column-stub' }, ctx.slots.default?.({ row }) ?? []);
  },
};

const openDialog = async (
  overrides: {
    editingTaskId?: string | null;
    userOptions?: Array<{ id: string; displayName: string }>;
  } = {},
) => {
  const wrapper = mount(TaskFormDialog, {
    props: {
      visible: false,
      editingTaskId: overrides.editingTaskId ?? null,
      userOptions: overrides.userOptions ?? [{ id: 'u1', displayName: '张三' }],
      sopFileOptions: [],
      submitting: false,
    },
    global: {
      stubs: {
        'el-dialog': dialogStub,
        'el-select': selectStub,
        'el-option': true,
        'el-button': { template: '<button><slot/></button>' },
        'el-input': true,
        'el-input-number': true,
        'el-date-picker': true,
        'el-form': passthroughStub,
        'el-form-item': passthroughStub,
        'el-tabs': passthroughStub,
        'el-tab-pane': passthroughStub,
        'el-table': passthroughStub,
        'el-table-column': tableColumnStub,
      },
    },
  });
  await wrapper.setProps({ visible: true });
  await flushPromises();
  await nextTick();
  return wrapper;
};

type DialogWrapper = Awaited<ReturnType<typeof openDialog>>;

const emitVisibleChange = async (wrapper: DialogWrapper, placeholder: string): Promise<void> => {
  const button = wrapper.findAll('.select-stub').find((b) => b.text() === placeholder);
  expect(button).toBeDefined();
  await button!.trigger('click');
};

const emitChange = async (
  wrapper: DialogWrapper,
  placeholder: string,
  value: unknown,
): Promise<void> => {
  const select = wrapper
    .findAllComponents({ name: 'ElSelectStub' })
    .find((s) => s.text() === placeholder);
  expect(select).toBeDefined();
  // 真实 el-select 选中后先更新 v-model 再触发 change
  await select!.vm.$emit('update:modelValue', value);
  await select!.vm.$emit('change', value);
  await flushPromises();
};

const emitSubmit = async (wrapper: DialogWrapper): Promise<void> => {
  const button = wrapper.findAll('button').find((b) => b.text() === '保存任务');
  expect(button).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
};

const releasedOrder = (id: string): Record<string, unknown> => ({
  id,
  workOrderNo: 'WO-1',
  productId: 'p1',
  productCode: 'P001',
  productName: '环形器',
  remainingQuantity: '100',
});

const defaultProduct = {
  id: 'p1',
  itemCode: 'P001',
  productName: '环形器',
  itemKind: 'finished_product',
  acquireMethod: 'self_made',
  unit: 'pcs',
  defaultRouteId: 'r2',
};

const defaultRoutes = [
  {
    id: 'r1',
    routeCode: 'R001',
    routeName: '路线1',
    productId: 'p1',
    versionNo: 'V1',
    status: 'enabled',
  },
  {
    id: 'r2',
    routeCode: 'R002',
    routeName: '路线2',
    productId: 'p1',
    versionNo: 'V2',
    status: 'enabled',
  },
];

describe('TaskFormDialog', () => {
  beforeEach(() => {
    productOptions.mockReset();
    productOptions.mockResolvedValue([]);
    routeOptions.mockReset();
    routeOptions.mockResolvedValue([]);
    routeSteps.mockReset();
    routeSteps.mockResolvedValue([]);
    workOrderOptions.mockReset();
    workOrderOptions.mockResolvedValue([]);
    vi.mocked(EMessage.warning).mockClear();
  });

  it('opening the dialog refreshes its own sources and emits refresh-users/refresh-sop-files', async () => {
    const wrapper = await openDialog();
    expect(productOptions).toHaveBeenCalledTimes(1);
    expect(routeOptions).toHaveBeenCalledTimes(1);
    expect(workOrderOptions).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('refresh-users')).toHaveLength(1);
    expect(wrapper.emitted('refresh-sop-files')).toHaveLength(1);
    // 用户 / SOP 候选由页面持有：弹窗只触发刷新，不再请求产品 / 路线 / 工单之外资源
    expect(wrapper.emitted('refresh-work-orders')).toBeUndefined();
    expect(wrapper.emitted('refresh-routes')).toBeUndefined();
  });

  it('expanding the work order select requests only workOrderOptions', async () => {
    const wrapper = await openDialog();
    productOptions.mockClear();
    routeOptions.mockClear();
    workOrderOptions.mockClear();

    await emitVisibleChange(wrapper, '请选择工单');

    expect(workOrderOptions).toHaveBeenCalledTimes(1);
    expect(routeOptions).not.toHaveBeenCalled();
    expect(productOptions).not.toHaveBeenCalled();
  });

  it('expanding the route select requests only routeOptions', async () => {
    const wrapper = await openDialog();
    productOptions.mockClear();
    routeOptions.mockClear();
    workOrderOptions.mockClear();

    await emitVisibleChange(wrapper, '请选择工艺路线');

    expect(routeOptions).toHaveBeenCalledTimes(1);
    expect(workOrderOptions).not.toHaveBeenCalled();
    expect(productOptions).not.toHaveBeenCalled();
  });

  it('expanding the user select refreshes only users (emits refresh-users)', async () => {
    const wrapper = await openDialog();
    const before = wrapper.emitted('refresh-users')?.length ?? 0;

    await emitVisibleChange(wrapper, '请选择负责人');

    expect(wrapper.emitted('refresh-users')?.length).toBe(before + 1);
    expect(routeOptions).toHaveBeenCalledTimes(1); // 打开时刷新一次，展开下拉不再重复请求
    expect(workOrderOptions).toHaveBeenCalledTimes(1);
  });

  it('handleWorkOrderChange picks the default route via resolveDefaultRouteId', async () => {
    productOptions.mockResolvedValue([defaultProduct]);
    routeOptions.mockResolvedValue(defaultRoutes);
    workOrderOptions.mockResolvedValue([releasedOrder('wo1')]);

    const wrapper = await openDialog();

    await emitChange(wrapper, '请选择工单', 'wo1');

    const vm = wrapper.vm as unknown as {
      form: { routeId: string; plannedQuantity: number };
    };
    expect(vm.form.routeId).toBe('r2'); // 默认路线 r2（产品 defaultRouteId）优先，其次第一条
    expect(vm.form.plannedQuantity).toBe(100); // 剩余 = WorkOrderOption.remainingQuantity
  });

  it('defers default-route resolution until product/route candidates are ready', async () => {
    let resolveProducts!: (value: unknown[]) => void;
    let resolveRoutes!: (value: unknown[]) => void;
    productOptions.mockImplementationOnce(
      () => new Promise((resolve) => (resolveProducts = resolve)),
    );
    routeOptions.mockImplementationOnce(() => new Promise((resolve) => (resolveRoutes = resolve)));
    workOrderOptions.mockResolvedValue([releasedOrder('wo1')]);

    // 工单候选先返回，产品 / 路线候选仍挂起
    const wrapper = await openDialog();

    await emitChange(wrapper, '请选择工单', 'wo1');

    const vm = wrapper.vm as unknown as { form: { routeId: string } };
    expect(vm.form.routeId).toBe(''); // 候选未就绪，默认路线待补算

    resolveProducts([defaultProduct]);
    await nextTick();
    expect(vm.form.routeId).toBe(''); // 路线候选仍未就绪，不补算

    resolveRoutes(defaultRoutes);
    await flushPromises();
    await nextTick();

    expect(vm.form.routeId).toBe('r2'); // 候选就绪后补算默认路线
    expect(routeSteps).toHaveBeenCalledWith('r2'); // 工序执行预览被补算
  });

  it('edit mode: work order not in released candidates still saves', async () => {
    // 编辑工单可能不在 released 候选内（已全部分配 / 状态变化）
    workOrderOptions.mockResolvedValue([]);
    routeOptions.mockResolvedValue(defaultRoutes);

    const wrapper = await openDialog({ editingTaskId: 'batch1' });

    (
      wrapper.vm as unknown as {
        setForm: (row: {
          workOrderId: string;
          batchNo: string;
          routeId: string | null;
          ownerId: string | null;
          plannedQuantity: string | number;
          planStartDate: string;
          planEndDate: string;
          remark: string | null;
        }) => void;
      }
    ).setForm({
      workOrderId: 'wo1', // 不在候选内
      batchNo: 'B001',
      routeId: 'r1',
      ownerId: 'u1',
      plannedQuantity: 100,
      planStartDate: '2026-08-01',
      planEndDate: '2026-08-31',
      remark: null,
    });
    await flushPromises();

    await emitSubmit(wrapper);

    const saveEvents = wrapper.emitted('save');
    expect(saveEvents).toHaveLength(1);
    const payload = saveEvents![0][0] as { workOrderId: string; routeId: string; ownerId: string };
    expect(payload.workOrderId).toBe('wo1');
    expect(payload.routeId).toBe('r1');
    expect(payload.ownerId).toBe('u1');
  });

  it('blocks submit when the selected route is no longer available', async () => {
    workOrderOptions.mockResolvedValue([releasedOrder('wo1')]);
    routeOptions.mockResolvedValue([]); // 已选路线 r9 不在候选内

    const wrapper = await openDialog();

    (
      wrapper.vm as unknown as {
        setForm: (row: {
          workOrderId: string;
          batchNo: string;
          routeId: string | null;
          ownerId: string | null;
          plannedQuantity: string | number;
          planStartDate: string;
          planEndDate: string;
          remark: string | null;
        }) => void;
      }
    ).setForm({
      workOrderId: 'wo1',
      batchNo: '',
      routeId: 'r9',
      ownerId: 'u1',
      plannedQuantity: 50,
      planStartDate: '2026-08-01',
      planEndDate: '2026-08-31',
      remark: null,
    });
    await flushPromises();

    await emitSubmit(wrapper);

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(EMessage.warning).toHaveBeenCalledWith('所选工艺路线已失效，请重新选择');
  });

  it('blocks submit when the selected owner is no longer available', async () => {
    workOrderOptions.mockResolvedValue([releasedOrder('wo1')]);
    routeOptions.mockResolvedValue(defaultRoutes); // 路线 r1 在候选内，放行到负责人校验
    const wrapper = await openDialog({ userOptions: [{ id: 'u1', displayName: '张三' }] });

    (
      wrapper.vm as unknown as {
        setForm: (row: {
          workOrderId: string;
          batchNo: string;
          routeId: string | null;
          ownerId: string | null;
          plannedQuantity: string | number;
          planStartDate: string;
          planEndDate: string;
          remark: string | null;
        }) => void;
      }
    ).setForm({
      workOrderId: 'wo1',
      batchNo: '',
      routeId: 'r1',
      ownerId: 'u9', // 不在负责人候选内
      plannedQuantity: 50,
      planStartDate: '2026-08-01',
      planEndDate: '2026-08-31',
      remark: null,
    });
    await flushPromises();

    await emitSubmit(wrapper);

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(EMessage.warning).toHaveBeenCalledWith('所选负责人已失效，请重新选择');
  });

  it('the step-preview table selects refresh only their own resource on expand', async () => {
    const wrapper = await openDialog();

    // 打开工序执行预览（新增模式需要 routeId）
    (
      wrapper.vm as unknown as {
        setForm: (row: {
          workOrderId: string;
          batchNo: string;
          routeId: string | null;
          ownerId: string | null;
          plannedQuantity: string | number;
          remark: string | null;
        }) => void;
      }
    ).setForm({
      workOrderId: 'wo1',
      batchNo: '',
      routeId: 'r1',
      ownerId: null,
      plannedQuantity: 100,
      remark: null,
    });
    await flushPromises();

    // 逐行 SOP 文件下拉只刷新 SOP 文件
    const beforeSop = wrapper.emitted('refresh-sop-files')?.length ?? 0;
    await emitVisibleChange(wrapper, '留空则使用默认文件');
    expect(wrapper.emitted('refresh-sop-files')?.length).toBe(beforeSop + 1);
  });

  it('uses a local filterable work-order select without remote-method', async () => {
    const wrapper = await openDialog();

    const workOrderSelect = wrapper
      .findAllComponents({ name: 'ElSelectStub' })
      .find((s) => s.text() === '请选择工单');
    expect(workOrderSelect?.props('filterable')).toBe(true);
    expect(workOrderSelect?.props('remote')).toBe(false);
    expect(workOrderSelect?.props('remoteMethod')).toBeUndefined();
  });

  it('shows a previously selected work order as expired when it leaves the candidates', async () => {
    workOrderOptions.mockResolvedValueOnce([releasedOrder('wo1')]).mockResolvedValueOnce([]);
    const wrapper = await openDialog();

    await emitChange(wrapper, '请选择工单', 'wo1');
    await emitVisibleChange(wrapper, '请选择工单'); // 展开工单下拉，本次候选为空
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      workOrderChoices: Array<{
        value: string;
        option: Record<string, unknown> | null;
        isUnavailable: boolean;
      }>;
    };
    const choice = vm.workOrderChoices.find((c) => c.value === 'wo1');
    expect(choice?.isUnavailable).toBe(true);
    expect(choice?.option).toBeNull();
  });

  it('blocks submit when the selected work order is no longer in the candidates', async () => {
    workOrderOptions.mockResolvedValueOnce([releasedOrder('wo1')]).mockResolvedValueOnce([]);
    const wrapper = await openDialog();

    await emitChange(wrapper, '请选择工单', 'wo1');
    await emitVisibleChange(wrapper, '请选择工单');
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      form: { planStartDate: string; planEndDate: string };
    };
    vm.form.planStartDate = '2026-08-01';
    vm.form.planEndDate = '2026-08-31';

    await emitSubmit(wrapper);

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(EMessage.warning).toHaveBeenCalledWith('所选工单已失效，请重新选择');
  });

  it('refreshing the work-order candidates never overwrites the filled draft', async () => {
    workOrderOptions.mockResolvedValue([releasedOrder('wo1')]);
    routeOptions.mockResolvedValue(defaultRoutes);
    const wrapper = await openDialog();

    await emitChange(wrapper, '请选择工单', 'wo1');
    const vm = wrapper.vm as unknown as {
      form: { routeId: string; remark: string; plannedQuantity: number };
    };
    vm.form.routeId = 'r9';
    vm.form.remark = 'draft note';

    await emitVisibleChange(wrapper, '请选择工单'); // 候选刷新与已选一致
    await flushPromises();

    expect(vm.form.routeId).toBe('r9');
    expect(vm.form.remark).toBe('draft note');
  });
});
