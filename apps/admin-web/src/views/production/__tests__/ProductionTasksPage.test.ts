import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { KeepAlive, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { RequestError } from '@company/request';
import { IDEMPOTENCY_RESULT_CORRUPT } from '@company/constants';
import ProductionTasksPage from '../ProductionTasksPage.vue';

const {
  listBatches,
  listOrders,
  generateMaterialDemands,
  getBatchCancellationCheck,
  cancelBatch,
  productOptions,
  routeOptions,
  userOptions,
  technicalFiles,
  confirm,
  success,
  error,
} = vi.hoisted(() => ({
  listBatches: vi.fn(),
  listOrders: vi.fn(),
  generateMaterialDemands: vi.fn(),
  getBatchCancellationCheck: vi.fn(),
  cancelBatch: vi.fn(),
  productOptions: vi.fn(),
  routeOptions: vi.fn(),
  userOptions: vi.fn(),
  technicalFiles: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

// 模拟 API 模块，避免发起真实 HTTP 请求（ECONNREFUSED）。
vi.mock('../../../api/product', () => ({
  productApi: {
    productOptions,
    routeOptions,
    userOptions,
    technicalFiles,
  },
}));
vi.mock('../../../api/production', () => ({
  productionApi: {
    listBatches,
    listOrders,
    generateMaterialDemands,
    getBatchCancellationCheck,
    cancelBatch,
  },
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning: vi.fn() },
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'test', component: { template: '<div />' } }],
});

const batchRow = {
  id: 'b1',
  batchNo: 'B-001',
  workOrderId: 'o1',
  workOrderNo: 'WO-001',
  productId: 'p1',
  productCode: 'P001',
  productName: '环形器',
  plannedQuantity: 100,
  completedQuantity: 0,
  qualifiedQuantity: 0,
  routeId: null,
  routeCode: null,
  status: 'pending',
  ownerName: null,
  version: 0,
};

const productionBatchCancelDialogStub = {
  name: 'ProductionBatchCancelDialog',
  props: ['visible', 'batch', 'check', 'submitting'],
  emits: ['update:visible', 'confirm'],
  template: '<div />',
};

describe('ProductionTasksPage', () => {
  const mountPage = () =>
    mount(ProductionTasksPage, {
      global: {
        plugins: [ElementPlus, router, createPinia()],
        stubs: { ProductionBatchCancelDialog: productionBatchCancelDialogStub },
      },
    });

  /** 放入 KeepAlive：让 onActivated 首次挂载即触发，验证页面激活的候选刷新行为 */
  const mountPageWithKeepAlive = () =>
    mount(
      {
        components: { KeepAlive, ProductionTasksPage },
        template: '<KeepAlive><ProductionTasksPage /></KeepAlive>',
      },
      {
        global: {
          plugins: [ElementPlus, router, createPinia()],
          stubs: { ProductionBatchCancelDialog: productionBatchCancelDialogStub },
        },
      },
    );

  beforeEach(() => {
    listBatches.mockReset();
    listBatches.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    listOrders.mockReset();
    listOrders.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    generateMaterialDemands.mockReset();
    generateMaterialDemands.mockResolvedValue(undefined);
    getBatchCancellationCheck.mockReset();
    getBatchCancellationCheck.mockResolvedValue({
      productionBatchId: 'b1',
      batchStatus: 'material_assigned',
      version: 2,
      canCancel: true,
      blockers: [],
      activeDemandCount: 2,
      activeAllocationCount: 2,
      pendingOutboundCount: 1,
      pendingOutbounds: [{ id: 'ob1', outboundNo: 'OUT-001' }],
    });
    cancelBatch.mockReset();
    cancelBatch.mockResolvedValue(undefined);
    productOptions.mockReset();
    productOptions.mockResolvedValue([]);
    routeOptions.mockReset();
    routeOptions.mockResolvedValue([]);
    userOptions.mockReset();
    userOptions.mockResolvedValue([]);
    technicalFiles.mockReset();
    technicalFiles.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    confirm.mockReset();
    confirm.mockResolvedValue(undefined);
  });

  it('renders the query panel', () => {
    const wrapper = mountPage();
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('关键字');
    expect(wrapper.text()).toContain('负责人');
    expect(wrapper.text()).toContain('状态');
  });

  it('renders the table panel with toolbar and add button', () => {
    const wrapper = mountPage();
    expect(wrapper.find('.table-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('新增任务');
  });

  it('renders the el-table component', () => {
    const wrapper = mountPage();
    expect(wrapper.find('.tasks-table').exists()).toBe(true);
    expect(wrapper.text()).toContain('No Data');
  });

  it('shows pagination', () => {
    const wrapper = mountPage();
    expect(wrapper.findComponent({ name: 'PaginationFooter' }).exists()).toBe(true);
  });

  it('shows cancellation effects and submits the server check version with a reason', async () => {
    listBatches.mockResolvedValue({ items: [batchRow], total: 1, page: 1, pageSize: 10 });
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      openBatchCancellation: (row: typeof batchRow) => Promise<void>;
    };

    await vm.openBatchCancellation(batchRow);
    await flushPromises();

    const dialog = wrapper.findComponent({ name: 'ProductionBatchCancelDialog' });
    expect(dialog.props('check')).toMatchObject({
      activeDemandCount: 2,
      activeAllocationCount: 2,
      pendingOutboundCount: 1,
    });
    dialog.vm.$emit('confirm', '计划调整');
    await flushPromises();

    expect(cancelBatch).toHaveBeenCalledWith('b1', { version: 2, reason: '计划调整' });
    expect(success).toHaveBeenCalledWith(expect.stringContaining('生产任务已取消'));
  });

  it('requests the target page when the pagination page changes', async () => {
    const wrapper = mountPage();
    await flushPromises();
    listBatches.mockClear();

    const pagination = wrapper.findComponent({ name: 'PaginationFooter' });
    expect(pagination.exists()).toBe(true);
    pagination.vm.$emit('pageChange', 2);
    await flushPromises();

    expect(listBatches).toHaveBeenCalledTimes(1);
    expect(listBatches.mock.calls[0][0]).toMatchObject({ page: 2 });
  });

  it('renders with the correct component name for KeepAlive', () => {
    const wrapper = mountPage();
    expect(wrapper.vm.$options.name).toBe('ProductionTasksPage');
  });

  it('disables the generate-materials button while the write is pending and submits once', async () => {
    // 行必须持续存在：写操作成功后页面会重新加载列表
    listBatches.mockResolvedValue({ items: [batchRow], total: 1, page: 1, pageSize: 10 });
    let resolveDemands!: (value: unknown) => void;
    generateMaterialDemands.mockReturnValue(new Promise((resolve) => (resolveDemands = resolve)));

    const wrapper = mountPage();
    await flushPromises();

    const findGenerate = () =>
      wrapper.findAll('button').find((b) => b.text().trim() === '生成物料');
    expect(findGenerate()).toBeDefined();
    expect(findGenerate()!.attributes('disabled')).toBeUndefined();

    await findGenerate()!.trigger('click');
    await nextTick();
    expect(findGenerate()!.attributes('disabled')).toBeDefined(); // 写操作在途：按钮禁用
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('该生产任务将不可再编辑'),
      '生成物料需求确认',
      expect.objectContaining({ confirmButtonText: '确认生成', type: 'warning' }),
    );
    expect(generateMaterialDemands).toHaveBeenCalledTimes(1);
    expect(generateMaterialDemands).toHaveBeenCalledWith('b1', 0);

    resolveDemands(undefined);
    await flushPromises();
    expect(findGenerate()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
  });

  it('does not generate material demands when the irreversible-action warning is cancelled', async () => {
    listBatches.mockResolvedValue({ items: [batchRow], total: 1, page: 1, pageSize: 10 });
    confirm.mockRejectedValueOnce('cancel');
    const wrapper = mountPage();
    await flushPromises();

    const generateButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === '生成物料');
    expect(generateButton).toBeDefined();
    await generateButton!.trigger('click');
    await flushPromises();

    expect(generateMaterialDemands).not.toHaveBeenCalled();
    expect(generateButton!.attributes('disabled')).toBeUndefined();
  });

  it('expanding the 负责人 filter refreshes only the user options source', async () => {
    const wrapper = mountPage();
    await flushPromises();
    productOptions.mockClear();
    routeOptions.mockClear();
    listOrders.mockClear();
    userOptions.mockClear();

    const ownerFormItem = wrapper
      .findAll('.el-form-item')
      .find((item) => item.text().includes('负责人'));
    expect(ownerFormItem).toBeDefined();
    const ownerSelect = ownerFormItem!.findComponent({ name: 'ElSelect' });
    await ownerSelect.vm.$emit('visible-change', true);
    await flushPromises();

    expect(userOptions).toHaveBeenCalledTimes(1); // 页面级负责人候选被定向刷新
    expect(productOptions).not.toHaveBeenCalled();
    expect(routeOptions).not.toHaveBeenCalled();
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('shows a selected owner removed from the candidates as expired in the filter', async () => {
    userOptions.mockResolvedValue([{ id: 'u1', displayName: '张三' }]);
    const wrapper = mountPage();
    await flushPromises();

    // 展开负责人筛选，候选加载完成（含 u1）
    const ownerFormItem = wrapper
      .findAll('.el-form-item')
      .find((item) => item.text().includes('负责人'));
    expect(ownerFormItem).toBeDefined();
    const ownerSelect = ownerFormItem!.findComponent({ name: 'ElSelect' });
    await ownerSelect.vm.$emit('visible-change', true);
    await flushPromises();

    // 已选负责人在后续刷新中被移除
    userOptions.mockResolvedValue([]);
    await ownerSelect.vm.$emit('visible-change', true);
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      query: { ownerId: string };
      userChoices: unknown[];
    };
    vm.query.ownerId = 'u1';
    await nextTick();

    expect(vm.userChoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'u1', option: null, isUnavailable: true }),
      ]),
    );
  });

  it('on activation refreshes only users and SOP files, never product/route/work-order', async () => {
    mountPageWithKeepAlive();
    await flushPromises();

    // 首次挂载：onMounted 只加载正式列表；onActivated 只刷新页面持有的候选
    expect(listBatches).toHaveBeenCalledTimes(1);
    expect(userOptions).toHaveBeenCalledTimes(1);
    expect(technicalFiles).toHaveBeenCalledTimes(1);
    expect(productOptions).not.toHaveBeenCalled();
    expect(routeOptions).not.toHaveBeenCalled();
    expect(listOrders).not.toHaveBeenCalled();
  });
});

type TaskGuardVm = {
  createBatchIntent: {
    execute: (snapshot: unknown, submit: (key: string) => Promise<unknown>) => Promise<unknown>;
    getStatus: () => string;
  };
  handleTaskDialogClose: (visible: boolean) => Promise<void>;
  taskDialogVisible: boolean;
};

const intentSnapshot = {
  intentType: 'production.batch.create',
  params: { workOrderId: 'o1' },
  query: {},
  body: { batchNo: null, remark: null },
};

describe('ProductionTasksPage task dialog close guard', () => {
  const mountPage = () =>
    mount(ProductionTasksPage, {
      global: {
        plugins: [ElementPlus, router, createPinia()],
        stubs: { ProductionBatchCancelDialog: productionBatchCancelDialogStub },
      },
    });
  const guardVm = (wrapper: VueWrapper) => wrapper.vm as unknown as TaskGuardVm;

  beforeEach(() => {
    confirm.mockReset();
  });

  it('idle 状态直接关闭：不弹确认、不残留意图', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);

    await vm.handleTaskDialogClose(true);
    await vm.handleTaskDialogClose(false);

    expect(confirm).not.toHaveBeenCalled();
    expect(vm.taskDialogVisible).toBe(false);
  }, 15_000);

  it('网络模糊失败后关闭弹窗：先确认，用户取消则保留弹窗与 K1', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);

    await vm.handleTaskDialogClose(true); // 打开弹窗
    await expect(
      vm.createBatchIntent.execute(intentSnapshot, () =>
        Promise.reject(new RequestError('网络断开', 0)),
      ),
    ).rejects.toBeInstanceOf(RequestError);
    expect(vm.createBatchIntent.getStatus()).toBe('pending');

    confirm.mockRejectedValue('cancel');
    await vm.handleTaskDialogClose(false);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('结果未知');
    expect(vm.taskDialogVisible).toBe(true);
    expect(vm.createBatchIntent.getStatus()).toBe('pending');

    confirm.mockResolvedValue('confirm');
    await vm.handleTaskDialogClose(false);
    expect(vm.taskDialogVisible).toBe(false);
    expect(vm.createBatchIntent.getStatus()).toBe('idle');
  }, 15_000);

  it('模糊失败后修改表单提交：不静默换键盲发，提示先核对结果', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);

    await vm.handleTaskDialogClose(true); // 打开弹窗
    // 真实 intent 提交失败（断网）→ pending，同键可重试
    await expect(
      vm.createBatchIntent.execute(intentSnapshot, () =>
        Promise.reject(new RequestError('网络断开', 0)),
      ),
    ).rejects.toBeInstanceOf(RequestError);
    expect(vm.createBatchIntent.getStatus()).toBe('pending');

    // 修改业务内容后再次提交：不得静默换新键盲发，必须提示先核对结果
    await expect(
      vm.createBatchIntent.execute(
        { ...intentSnapshot, body: { batchNo: null, remark: 'changed' } },
        () => Promise.resolve('ok'),
      ),
    ).rejects.toThrow(/结果未知/);
    expect(vm.createBatchIntent.getStatus()).toBe('pending'); // K1 未丢失、未换键
  }, 15_000);

  it('结果损坏后关闭弹窗：按 blocked 文案提示重复批次风险，不静默放行 K2', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);

    await vm.handleTaskDialogClose(true); // 打开弹窗
    await expect(
      vm.createBatchIntent.execute(intentSnapshot, () =>
        Promise.reject(new RequestError('结果损坏', 500, undefined, IDEMPOTENCY_RESULT_CORRUPT)),
      ),
    ).rejects.toBeTruthy();
    expect(vm.createBatchIntent.getStatus()).toBe('blocked');

    confirm.mockRejectedValue('cancel');
    await vm.handleTaskDialogClose(false);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('结果已损坏');
    expect(confirm.mock.calls[0][0]).toContain('重复批次');
    expect(vm.taskDialogVisible).toBe(true);
    expect(vm.createBatchIntent.getStatus()).toBe('blocked');
  }, 15_000);

  it('意图超出 12 小时重试窗口后关闭弹窗：按超窗口文案提示，不静默放行重复提交', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);
    await vm.handleTaskDialogClose(true); // 打开弹窗（真实计时器下完成挂载与确认）

    vi.useFakeTimers();
    try {
      // 网络模糊失败 → pending；推进到超过 12 小时窗口 → expired
      await expect(
        vm.createBatchIntent.execute(intentSnapshot, () =>
          Promise.reject(new RequestError('网络断开', 0)),
        ),
      ).rejects.toBeInstanceOf(RequestError);
      vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
      expect(vm.createBatchIntent.getStatus()).toBe('expired');

      confirm.mockRejectedValue('cancel');
      await vm.handleTaskDialogClose(false);

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0][0]).toContain('重试窗口');
      expect(vm.taskDialogVisible).toBe(true);
      expect(vm.createBatchIntent.getStatus()).toBe('expired');
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);
});
