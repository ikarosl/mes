import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductionOrdersPage from '../ProductionOrdersPage.vue';

const { listOrders, listOrderBatches, changeOrderStatus, confirm, success, error } = vi.hoisted(
  () => ({
    listOrders: vi.fn(),
    listOrderBatches: vi.fn(),
    changeOrderStatus: vi.fn(),
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
  },
}));
vi.mock('../../../api/production', () => ({
  productionApi: { listOrders, listOrderBatches, changeOrderStatus },
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

describe('ProductionOrdersPage', () => {
  const mountPage = () =>
    mount(ProductionOrdersPage, {
      global: { plugins: [ElementPlus, router, createPinia()] },
    });

  beforeEach(() => {
    listOrders.mockReset();
    listOrders.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    listOrderBatches.mockReset();
    listOrderBatches.mockResolvedValue([]);
    changeOrderStatus.mockReset();
    changeOrderStatus.mockResolvedValue(undefined);
    confirm.mockReset();
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
    expect(wrapper.find('.table-footer').exists()).toBe(true);
  });

  it('renders the page with stable component name', () => {
    const wrapper = mountPage();
    expect(wrapper.vm.$options.name).toBe('ProductionOrdersPage');
  });

  it('disables the row release button while the write is pending and submits once', async () => {
    listOrders.mockResolvedValueOnce({ items: [orderRow], total: 1, page: 1, pageSize: 10 });
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
    expect(changeOrderStatus).not.toHaveBeenCalled();

    confirmResolve('confirm');
    await flushPromises();
    expect(changeOrderStatus).toHaveBeenCalledTimes(1);
    expect(changeOrderStatus).toHaveBeenCalledWith('o1', 'release', 0);
    expect(findRelease()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
  });
});
