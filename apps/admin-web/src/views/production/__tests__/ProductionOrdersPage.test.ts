import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { RequestError } from '@company/request';
import { IDEMPOTENCY_RESULT_CORRUPT } from '@company/constants';
import ProductionOrdersPage from '../ProductionOrdersPage.vue';

const {
  listOrders,
  listOrderBatches,
  getOrder,
  releaseOrder,
  cancelOrder,
  completeOrder,
  closeOrder,
  confirm,
  prompt,
  success,
  error,
  productOptions,
  routeOptions,
  userOptions,
} = vi.hoisted(() => ({
  listOrders: vi.fn(),
  listOrderBatches: vi.fn(),
  getOrder: vi.fn(),
  releaseOrder: vi.fn(),
  cancelOrder: vi.fn(),
  completeOrder: vi.fn(),
  closeOrder: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  productOptions: vi.fn(),
  routeOptions: vi.fn(),
  userOptions: vi.fn(),
}));

// Mock API modules to prevent real HTTP calls (ECONNREFUSED)
vi.mock('../../../api/product', () => ({
  productApi: {
    productOptions,
    routeOptions,
    userOptions,
  },
}));
vi.mock('../../../api/production', () => ({
  productionApi: {
    listOrders,
    listOrderBatches,
    getOrder,
    releaseOrder,
    cancelOrder,
    completeOrder,
    closeOrder,
  },
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm, prompt },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning: vi.fn() },
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'test', component: { template: '<div />' } }],
});

const orderRow = {
  id: 'o1',
  workOrderNo: 'WO-001',
  productId: 'p1',
  productCode: 'P001',
  productName: '环形器',
  plannedQuantity: 100,
  assignedQuantity: 0,
  workOrderOwnerId: null,
  customerName: null,
  planStartDate: null,
  planEndDate: null,
  status: 'draft',
  version: 0,
};

const workOrderTransitionDialogStub = {
  name: 'WorkOrderTransitionDialog',
  props: ['visible', 'mode', 'order', 'submitting'],
  emits: ['update:visible', 'confirm'],
  template: '<div />',
};

describe('ProductionOrdersPage', () => {
  const mountPage = () =>
    mount(ProductionOrdersPage, {
      global: {
        plugins: [ElementPlus, router, createPinia()],
        stubs: { WorkOrderTransitionDialog: workOrderTransitionDialogStub },
      },
    });

  beforeEach(() => {
    listOrders.mockReset();
    listOrders.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    listOrderBatches.mockReset();
    listOrderBatches.mockResolvedValue([]);
    getOrder.mockReset();
    getOrder.mockResolvedValue({ ...orderRow, unit: '个', batches: [] });
    releaseOrder.mockReset();
    releaseOrder.mockResolvedValue(undefined);
    cancelOrder.mockReset();
    cancelOrder.mockResolvedValue(undefined);
    completeOrder.mockReset();
    completeOrder.mockResolvedValue(undefined);
    closeOrder.mockReset();
    closeOrder.mockResolvedValue(undefined);
    confirm.mockReset();
    prompt.mockReset();
    productOptions.mockReset();
    productOptions.mockResolvedValue([]);
    routeOptions.mockReset();
    routeOptions.mockResolvedValue([]);
    userOptions.mockReset();
    userOptions.mockResolvedValue([]);
  });

  it('renders the query panel with search fields', () => {
    const wrapper = mountPage();
    expect(wrapper.find('.query-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('关键字');
    expect(wrapper.text()).toContain('产品');
    expect(wrapper.text()).toContain('状态');
    expect(wrapper.text()).toContain('查询');
    expect(wrapper.text()).toContain('重置');
  });

  it('renders the table panel with toolbar and add button', () => {
    const wrapper = mountPage();
    expect(wrapper.find('.table-panel').exists()).toBe(true);
    expect(wrapper.text()).toContain('新增工单');
  });

  it('renders the el-table component', () => {
    const wrapper = mountPage();
    expect(wrapper.find('.orders-table').exists()).toBe(true);
    expect(wrapper.text()).toContain('No Data');
  });

  it('shows pagination footer', () => {
    const wrapper = mountPage();
    expect(wrapper.findComponent({ name: 'PaginationFooter' }).exists()).toBe(true);
  });

  it('requests the target page when the pagination page changes', async () => {
    const wrapper = mountPage();
    await flushPromises();
    listOrders.mockClear();

    const pagination = wrapper.findComponent({ name: 'PaginationFooter' });
    expect(pagination.exists()).toBe(true);
    pagination.vm.$emit('pageChange', 2);
    await flushPromises();

    expect(listOrders).toHaveBeenCalledTimes(1);
    expect(listOrders.mock.calls[0][0]).toMatchObject({ page: 2 });
  });

  it('renders the page with stable component name', () => {
    const wrapper = mountPage();
    expect(wrapper.vm.$options.name).toBe('ProductionOrdersPage');
  });

  it('refreshes the product candidates when the product filter expands', async () => {
    const wrapper = mountPage();
    await flushPromises();
    productOptions.mockClear();

    const productSelect = wrapper.findComponent({ name: 'ElSelect' });
    productSelect.vm.$emit('visible-change', true);
    await nextTick();

    expect(productOptions).toHaveBeenCalledTimes(1);
  });

  it('shows a selected product removed from the candidates as expired in the filter', async () => {
    productOptions.mockResolvedValue([
      {
        id: 'p1',
        itemCode: 'C1',
        productName: '产品1',
        itemKind: 'finished_product',
        acquireMethod: 'self_made',
        unit: '个',
        defaultRouteId: null,
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    // 展开产品筛选，候选加载完成（含 p1）
    const productSelect = wrapper.findComponent({ name: 'ElSelect' });
    await productSelect.vm.$emit('visible-change', true);
    await flushPromises();

    // 已选产品在后续刷新中被移除
    productOptions.mockResolvedValue([]);
    await productSelect.vm.$emit('visible-change', true);
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      query: { productId: string };
      productChoices: unknown[];
    };
    vm.query.productId = 'p1';
    await nextTick();

    expect(vm.productChoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'p1', option: null, isUnavailable: true }),
      ]),
    );
  });

  it('disables the row release button while the write is pending and submits once', async () => {
    // 行必须持续存在：写操作成功后页面会重新加载列表
    listOrders.mockResolvedValue({ items: [orderRow], total: 1, page: 1, pageSize: 10 });
    let confirmResolve!: (value: unknown) => void;
    confirm.mockReturnValue(new Promise((resolve) => (confirmResolve = resolve)));

    const wrapper = mountPage();
    await flushPromises();

    const findRelease = () => wrapper.findAll('button').find((b) => b.text().trim() === '下达');
    expect(findRelease()).toBeDefined();
    expect(findRelease()!.attributes('disabled')).toBeUndefined();

    await findRelease()!.trigger('click');
    await nextTick();
    expect(findRelease()!.attributes('disabled')).toBeDefined(); // 确认框期间行内写操作被占用
    expect(releaseOrder).not.toHaveBeenCalled();

    confirmResolve('confirm');
    await flushPromises();
    expect(releaseOrder).toHaveBeenCalledTimes(1);
    expect(releaseOrder).toHaveBeenCalledWith('o1', 0);
    expect(findRelease()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
  });

  it('keeps cancel, completion and close actions aligned with the work-order state machine', () => {
    const wrapper = mountPage();
    const vm = wrapper.vm as unknown as {
      canCancelOrder: (row: typeof orderRow) => boolean;
      canCompleteOrder: (row: typeof orderRow) => boolean;
      canCloseOrder: (row: typeof orderRow) => boolean;
    };

    expect(vm.canCancelOrder({ ...orderRow, status: 'draft' })).toBe(true);
    expect(vm.canCancelOrder({ ...orderRow, status: 'released' })).toBe(false);
    expect(vm.canCancelOrder({ ...orderRow, status: 'doing' })).toBe(false);
    expect(vm.canCompleteOrder({ ...orderRow, status: 'released' })).toBe(true);
    expect(vm.canCompleteOrder({ ...orderRow, status: 'doing' })).toBe(true);
    expect(vm.canCloseOrder({ ...orderRow, status: 'released' })).toBe(true);
    expect(vm.canCloseOrder({ ...orderRow, status: 'completed' })).toBe(true);
  });

  it('requires and trims a reason when cancelling a draft work order', async () => {
    prompt.mockResolvedValue({ value: '  计划取消  ' });
    const wrapper = mountPage();
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      cancelOrder: (row: typeof orderRow) => Promise<void>;
    };

    await vm.cancelOrder(orderRow);

    expect(prompt).toHaveBeenCalledOnce();
    expect(cancelOrder).toHaveBeenCalledWith('o1', { version: 0, reason: '计划取消' });
    expect(success).toHaveBeenCalledWith('工单已取消');
  });

  it('submits explicit completion and early-close commands from the review dialog', async () => {
    const released = { ...orderRow, status: 'released', version: 3 };
    getOrder.mockResolvedValue({ ...released, unit: '个', batches: [] });
    const wrapper = mountPage();
    const vm = wrapper.vm as unknown as {
      openWorkOrderTransition: (
        row: typeof released,
        mode: 'complete' | 'early-close' | 'archive',
      ) => Promise<void>;
      confirmWorkOrderTransition: (value: {
        mode: 'complete' | 'early-close' | 'archive';
        reason: string | null;
      }) => Promise<void>;
    };

    await vm.openWorkOrderTransition(released, 'complete');
    await vm.confirmWorkOrderTransition({ mode: 'complete', reason: null });
    expect(completeOrder).toHaveBeenCalledWith('o1', 3);

    await vm.openWorkOrderTransition(released, 'early-close');
    await vm.confirmWorkOrderTransition({ mode: 'early-close', reason: '客户取消' });
    expect(closeOrder).toHaveBeenCalledWith('o1', { version: 3, reason: '客户取消' });
  });
});

type GuardVm = {
  createBatchIntent: {
    execute: (snapshot: unknown, submit: (key: string) => Promise<unknown>) => Promise<unknown>;
    getStatus: () => string;
  };
  handleBatchFormDialogClose: (visible: boolean) => Promise<void>;
  batchFormDialogVisible: boolean;
};

const intentSnapshot = {
  intentType: 'production.batch.create',
  params: { workOrderId: 'o1' },
  query: {},
  body: { batchNo: null, remark: null },
};

describe('ProductionOrdersPage batch dialog close guard', () => {
  const mountPage = () =>
    mount(ProductionOrdersPage, {
      global: {
        plugins: [ElementPlus, router, createPinia()],
        stubs: { WorkOrderTransitionDialog: workOrderTransitionDialogStub },
      },
    });
  const guardVm = (wrapper: ReturnType<typeof mountPage>) => wrapper.vm as unknown as GuardVm;

  beforeEach(() => {
    confirm.mockReset();
  });

  it('idle 状态直接关闭：不弹确认、不残留意图', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);

    await vm.handleBatchFormDialogClose(true); // 打开
    await vm.handleBatchFormDialogClose(false); // 关闭

    expect(confirm).not.toHaveBeenCalled();
    expect(vm.batchFormDialogVisible).toBe(false);
  }, 15_000);

  it('网络模糊失败后关闭弹窗：先确认，用户取消则保留弹窗与 K1', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);

    await vm.handleBatchFormDialogClose(true); // 打开弹窗
    // 真实 intent 提交失败（断网）→ pending，同键可重试
    await expect(
      vm.createBatchIntent.execute(intentSnapshot, () =>
        Promise.reject(new RequestError('网络断开', 0)),
      ),
    ).rejects.toBeInstanceOf(RequestError);
    expect(vm.createBatchIntent.getStatus()).toBe('pending');

    confirm.mockRejectedValue('cancel'); // 用户选择「继续保留」
    await vm.handleBatchFormDialogClose(false);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('结果未知');
    expect(vm.batchFormDialogVisible).toBe(true); // 弹窗保持打开
    expect(vm.createBatchIntent.getStatus()).toBe('pending'); // K1 未丢失

    // 用户确认关闭 → 显式放弃
    confirm.mockResolvedValue('confirm');
    await vm.handleBatchFormDialogClose(false);
    expect(vm.batchFormDialogVisible).toBe(false);
    expect(vm.createBatchIntent.getStatus()).toBe('idle');
  }, 15_000);

  it('模糊失败后修改表单提交：不静默换键盲发，提示先核对结果', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);

    await vm.handleBatchFormDialogClose(true); // 打开弹窗
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

    await vm.handleBatchFormDialogClose(true); // 打开弹窗
    await expect(
      vm.createBatchIntent.execute(intentSnapshot, () =>
        Promise.reject(new RequestError('结果损坏', 500, undefined, IDEMPOTENCY_RESULT_CORRUPT)),
      ),
    ).rejects.toBeTruthy();
    expect(vm.createBatchIntent.getStatus()).toBe('blocked');

    confirm.mockRejectedValue('cancel');
    await vm.handleBatchFormDialogClose(false);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('结果已损坏');
    expect(confirm.mock.calls[0][0]).toContain('重复批次');
    expect(vm.batchFormDialogVisible).toBe(true);
    expect(vm.createBatchIntent.getStatus()).toBe('blocked');
  }, 15_000);

  it('意图超出 12 小时重试窗口后关闭弹窗：按超窗口文案提示，不静默放行重复提交', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const vm = guardVm(wrapper);
    await vm.handleBatchFormDialogClose(true); // 打开弹窗（真实计时器下完成挂载与确认）

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
      await vm.handleBatchFormDialogClose(false);

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0][0]).toContain('重试窗口');
      expect(vm.batchFormDialogVisible).toBe(true);
      expect(vm.createBatchIntent.getStatus()).toBe('expired');
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);
});
