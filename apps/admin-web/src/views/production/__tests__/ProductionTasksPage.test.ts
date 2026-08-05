import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { KeepAlive, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductionTasksPage from '../ProductionTasksPage.vue';

const {
  listBatches,
  listOrders,
  generateMaterialDemands,
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
  productOptions: vi.fn(),
  routeOptions: vi.fn(),
  userOptions: vi.fn(),
  technicalFiles: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

// Mock API modules to prevent real HTTP calls (ECONNREFUSED)
vi.mock('../../../api/product', () => ({
  productApi: {
    productOptions,
    routeOptions,
    userOptions,
    technicalFiles,
  },
}));
vi.mock('../../../api/production', () => ({
  productionApi: { listBatches, listOrders, generateMaterialDemands },
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
  routeId: null,
  routeCode: null,
  status: 'pending',
  ownerName: null,
  version: 0,
};

describe('ProductionTasksPage', () => {
  const mountPage = () =>
    mount(ProductionTasksPage, {
      global: { plugins: [ElementPlus, router, createPinia()] },
    });

  /** 放入 KeepAlive：让 onActivated 首次挂载即触发，验证页面激活的候选刷新行为 */
  const mountPageWithKeepAlive = () =>
    mount(
      {
        components: { KeepAlive, ProductionTasksPage },
        template: '<KeepAlive><ProductionTasksPage /></KeepAlive>',
      },
      { global: { plugins: [ElementPlus, router, createPinia()] } },
    );

  beforeEach(() => {
    listBatches.mockReset();
    listBatches.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    listOrders.mockReset();
    listOrders.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    generateMaterialDemands.mockReset();
    generateMaterialDemands.mockResolvedValue(undefined);
    productOptions.mockReset();
    productOptions.mockResolvedValue([]);
    routeOptions.mockReset();
    routeOptions.mockResolvedValue([]);
    userOptions.mockReset();
    userOptions.mockResolvedValue([]);
    technicalFiles.mockReset();
    technicalFiles.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    confirm.mockReset();
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
    expect(wrapper.find('.table-footer').exists()).toBe(true);
  });

  it('requests the target page when the pagination page changes', async () => {
    const wrapper = mountPage();
    await flushPromises();
    listBatches.mockClear();

    const pagination = wrapper.findComponent({ name: 'ElPagination' });
    expect(pagination.exists()).toBe(true);
    pagination.vm.$emit('current-change', 2);
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
    // generateMaterials 无确认框：直接调用 generateMaterialDemands，以在途请求作为 pending 窗口
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
    expect(generateMaterialDemands).toHaveBeenCalledTimes(1);
    expect(generateMaterialDemands).toHaveBeenCalledWith('b1', 0);

    resolveDemands(undefined);
    await flushPromises();
    expect(findGenerate()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
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
    const wrapper = mountPageWithKeepAlive();
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
