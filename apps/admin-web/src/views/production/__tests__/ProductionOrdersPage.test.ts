import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductionOrdersPage from '../ProductionOrdersPage.vue';

// Mock API modules to prevent real HTTP calls (ECONNREFUSED)
vi.mock('../../../api/product', () => ({
  productApi: {
    productFormOptions: vi.fn().mockResolvedValue({
      categories: [],
      products: [],
      routes: [],
    }),
    userOptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../../api/production', () => ({
  productionApi: {
    listOrders: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
    listOrderBatches: vi.fn().mockResolvedValue([]),
  },
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'test', component: { template: '<div />' } }],
});

describe('ProductionOrdersPage', () => {
  const mountPage = () =>
    mount(ProductionOrdersPage, {
      global: { plugins: [ElementPlus, router, createPinia()] },
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
});
