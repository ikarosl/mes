import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductionTasksPage from '../ProductionTasksPage.vue';

// Mock API modules to prevent real HTTP calls (ECONNREFUSED)
vi.mock('../../../api/product', () => ({
  productApi: {
    productFormOptions: vi.fn().mockResolvedValue({
      categories: [],
      products: [],
      routes: [],
    }),
    userOptions: vi.fn().mockResolvedValue([]),
    technicalFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
  },
}));
vi.mock('../../../api/production', () => ({
  productionApi: {
    listBatches: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
    listOrders: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
  },
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'test', component: { template: '<div />' } }],
});

describe('ProductionTasksPage', () => {
  const mountPage = () =>
    mount(ProductionTasksPage, {
      global: { plugins: [ElementPlus, router, createPinia()] },
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
});
