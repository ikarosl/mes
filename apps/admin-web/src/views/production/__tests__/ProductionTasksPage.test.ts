import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductionTasksPage from '../ProductionTasksPage.vue';

const { listBatches, listOrders, generateMaterialDemands, confirm, success, error } = vi.hoisted(
  () => ({
    listBatches: vi.fn(),
    listOrders: vi.fn(),
    generateMaterialDemands: vi.fn(),
    confirm: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
);

// Mock API modules to prevent real HTTP calls (ECONNREFUSED)
vi.mock('../../../api/product', () => ({
  productApi: {
    productOptions: vi.fn().mockResolvedValue([]),
    routeOptions: vi.fn().mockResolvedValue([]),
    userOptions: vi.fn().mockResolvedValue([]),
    technicalFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
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

  beforeEach(() => {
    listBatches.mockReset();
    listBatches.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    listOrders.mockReset();
    listOrders.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    generateMaterialDemands.mockReset();
    generateMaterialDemands.mockResolvedValue(undefined);
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

  it('renders with the correct component name for KeepAlive', () => {
    const wrapper = mountPage();
    expect(wrapper.vm.$options.name).toBe('ProductionTasksPage');
  });

  it('disables the generate-materials button while the write is pending and submits once', async () => {
    listBatches.mockResolvedValueOnce({ items: [batchRow], total: 1, page: 1, pageSize: 10 });
    let confirmResolve!: (value: unknown) => void;
    confirm.mockReturnValue(new Promise((resolve) => (confirmResolve = resolve)));

    const wrapper = mountPage();
    await flushPromises();

    const findGenerate = () =>
      wrapper.findAll('button').find((b) => b.text().trim() === '生成物料');
    expect(findGenerate()).toBeDefined();
    expect(findGenerate()!.attributes('disabled')).toBeUndefined();

    await findGenerate()!.trigger('click');
    await nextTick();
    expect(findGenerate()!.attributes('disabled')).toBeDefined(); // 确认框期间行内写操作被占用
    expect(generateMaterialDemands).not.toHaveBeenCalled();

    confirmResolve('confirm');
    await flushPromises();
    expect(generateMaterialDemands).toHaveBeenCalledTimes(1);
    expect(generateMaterialDemands).toHaveBeenCalledWith('b1', 0);
    expect(findGenerate()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
  });
});
