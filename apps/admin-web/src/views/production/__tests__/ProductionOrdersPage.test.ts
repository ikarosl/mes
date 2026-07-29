import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ProductionOrdersPage from '../ProductionOrdersPage.vue';

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
    // el-table renders with the orders-table class
    expect(wrapper.find('.orders-table').exists()).toBe(true);
    // The empty table shows "No Data" text from Element Plus
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
