import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskFormDialog from '../TaskFormDialog.vue';

const { productOptions, routeOptions, workOrderOptions, taskOwnerOptions } = vi.hoisted(() => ({
  productOptions: vi.fn(),
  routeOptions: vi.fn(),
  workOrderOptions: vi.fn(),
  taskOwnerOptions: vi.fn(),
}));

// 弹窗自持工艺路线、已下达工单和任务负责人候选。
vi.mock('../../../../api/product', () => ({
  productApi: { productOptions, routeOptions },
}));
vi.mock('../../../../api/production/work-orders', () => ({
  productionWorkOrdersApi: { workOrderOptions },
}));
vi.mock('../../../../api/production/tasks', () => ({ productionTasksApi: { taskOwnerOptions } }));
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

const openDialog = async (
  overrides: {
    editingTaskId?: string | null;
  } = {},
) => {
  const wrapper = mount(TaskFormDialog, {
    props: {
      visible: false,
      editingTaskId: overrides.editingTaskId ?? null,
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
  plannedQuantity: '100',
  assignedQuantity: '0',
  terminatedPlannedQuantity: '0',
  finalOutput: {
    availableQuantity: '0',
    extraQuantity: '0',
    scrapQuantity: '0',
    totalQuantity: '0',
    plannedShortfallQuantity: '100',
    finalizedBatchCount: 0,
    closingBatchCount: 0,
    pendingAvailableQuantity: '0',
    pendingExtraQuantity: '0',
  },
  remainingQuantity: '100',
  planStartDate: '2026-08-01',
  planEndDate: '2026-08-31',
});

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
    workOrderOptions.mockReset();
    workOrderOptions.mockResolvedValue([]);
    taskOwnerOptions.mockReset();
    taskOwnerOptions.mockResolvedValue([{ id: 'u1', displayName: '张三' }]);
    vi.mocked(EMessage.warning).mockClear();
  });

  it('opening the dialog refreshes its own sources', async () => {
    const wrapper = await openDialog();
    expect(productOptions).not.toHaveBeenCalled();
    expect(routeOptions).toHaveBeenCalledTimes(1);
    expect(workOrderOptions).toHaveBeenCalledTimes(1);
    expect(taskOwnerOptions).toHaveBeenCalledTimes(1);
    // 工单和路线由表单直接读取。
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

  // TODO(task-form): 验证切换工单保留所属工单的数量和日期约束；高重要性：计划额度与排程边界。
  // 旧旅程依赖自动选路，当前暂停；用户明确授权正式测试后按显式路线和合格任务负责人恢复。

  it('blocks task dates outside the selected work-order plan window', async () => {
    workOrderOptions.mockResolvedValue([releasedOrder('wo1')]);
    const wrapper = await openDialog();
    await emitChange(wrapper, '请选择工单', 'wo1');

    const vm = wrapper.vm as unknown as {
      form: { ownerId: string; planStartDate: string; planEndDate: string };
    };
    vm.form.ownerId = 'u1';
    vm.form.planStartDate = '2026-07-31';
    await emitSubmit(wrapper);

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(EMessage.warning).toHaveBeenCalledWith('任务计划日期必须位于工单计划区间内');
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
          ownerName: string | null;
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
      ownerName: '张三',
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
          ownerName: string | null;
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
      ownerName: '张三',
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
    const wrapper = await openDialog();

    (
      wrapper.vm as unknown as {
        setForm: (row: {
          workOrderId: string;
          batchNo: string;
          routeId: string | null;
          ownerId: string | null;
          ownerName: string | null;
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
      ownerName: '原负责人',
      plannedQuantity: 50,
      planStartDate: '2026-08-01',
      planEndDate: '2026-08-31',
      remark: null,
    });
    await flushPromises();

    await emitSubmit(wrapper);

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(EMessage.warning).toHaveBeenCalledWith('所选任务负责人已失效，请重新选择');
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
      form: { ownerId: string; planStartDate: string; planEndDate: string };
    };
    vm.form.ownerId = 'u1';
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
